const $ = (id) => document.getElementById(id);
const log = $("log");
const list = $("list");
const chat = $("chat");
const STAMP_GAP_MS = 10 * 60 * 1000;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function markdown(text) {
  const node = el("div", "bubble in assistant");
  node.append(...renderMarkdown(text));
  return node;
}

function details(cls, summaryNodes, open = false) {
  const d = el("details", cls);
  const s = el("summary");
  s.append(...summaryNodes);
  d.append(s, el("div", "body"));
  d.open = open;
  return d;
}

function section(label, child) {
  const wrap = el("div");
  wrap.append(el("div", "label", label), child);
  return wrap;
}

const TOOL_ARG = {
  Bash: (i) => i.command,
  Read: (i) => i.file_path,
  Write: (i) => i.file_path,
  Edit: (i) => i.file_path,
  Glob: (i) => i.pattern,
  Grep: (i) => i.pattern,
  Agent: (i) => i.description,
  Task: (i) => i.description,
  WebSearch: (i) => i.query,
  WebFetch: (i) => i.url,
  Skill: (i) => i.skill,
  ToolSearch: (i) => i.query,
  exec: (i) => i.input,
};

function toolArg(name, input) {
  const pick = TOOL_ARG[name];
  return pick ? pick(input) : JSON.stringify(input);
}

function diff(oldStr, newStr) {
  const pre = el("pre", "diff");
  for (const line of oldStr.split("\n")) pre.append(el("div", "del", "- " + line));
  for (const line of newStr.split("\n")) pre.append(el("div", "add", "+ " + line));
  return pre;
}

function toolInput(name, input) {
  if (name === "Edit") return diff(input.old_string, input.new_string);
  if (name === "Write") return el("pre", "", input.content);
  if (name === "Bash") return el("pre", "", input.command);
  if (name === "exec") return el("pre", "", input.input);
  return el("pre", "", JSON.stringify(input, null, 2));
}

function toolResult(block) {
  const wrap = el("div", "result" + (block.is_error ? " error" : ""));
  const parts = typeof block.content === "string" ? [{ type: "text", text: block.content }] : block.content;
  for (const part of parts) {
    if (part.type === "text") wrap.append(el("pre", "", part.text));
    else if (part.type === "image") {
      const img = el("img");
      img.src = `data:${part.source.media_type};base64,${part.source.data}`;
      wrap.append(img);
    } else wrap.append(el("pre", "", JSON.stringify(part)));
  }
  return section(block.is_error ? "Error" : "Result", wrap);
}

function thinking(text) {
  const d = details("bubble in thinking", [el("span", "", "Thinking")]);
  d.querySelector(".body").textContent = text;
  return d;
}

function noticeLabel(text) {
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(text);
  if (summary) return summary[1];
  return text.replace(/<[^>]+>/g, " ").trim().split("\n")[0].slice(0, 100);
}

function userText(text, human) {
  if (!human) {
    const d = details("meta-msg", [el("span", "", noticeLabel(text))]);
    d.querySelector(".body").append(el("pre", "", text));
    return d;
  }
  const node = el("div", "bubble out");
  node.append(el("pre", "", text));
  return node;
}

function stamp(t) {
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return el("div", "stamp", `${day} ${time}`);
}

function side(node) {
  if (!node?.classList.contains("bubble")) return null;
  return node.classList.contains("out") ? "out" : "in";
}

function markTails() {
  for (const node of log.children) {
    if (side(node) && side(node) !== side(node.nextElementSibling)) node.classList.add("tail");
  }
}

function render(lines) {
  log.replaceChildren();
  const tools = new Map();
  let model = "";
  let tokensOut = 0;
  const counted = new Set();
  let first = null;
  let last = null;
  let prevTs = 0;

  const add = (node, ts) => {
    const t = Date.parse(ts);
    if (t - prevTs > STAMP_GAP_MS) log.append(stamp(t));
    prevTs = t;
    log.append(node);
  };

  for (const e of lines) {
    if (!e.timestamp) continue;
    if (e.type === "user") {
      first ??= e;
      last = e;
      const c = e.message.content;
      if (typeof c === "string") add(userText(c, isHuman(e)), e.timestamp);
      else for (const b of c) {
        if (b.type === "tool_result") {
          const card = tools.get(b.tool_use_id);
          card.classList.toggle("error", !!b.is_error);
          card.querySelector(".status").textContent = b.is_error ? "error" : "done";
          card.querySelector(".body").append(toolResult(b));
        } else if (b.type === "text") add(userText(b.text, isHuman(e)), e.timestamp);
      }
    } else if (e.type === "assistant") {
      last = e;
      model = e.message.model;
      if (!counted.has(e.message.id)) tokensOut += e.message.usage?.output_tokens ?? 0;
      counted.add(e.message.id);
      for (const b of e.message.content) {
        if (b.type === "text") add(markdown(b.text), e.timestamp);
        else if (b.type === "thinking" && b.thinking) add(thinking(b.thinking), e.timestamp);
        else if (b.type === "tool_use") {
          const d = details("bubble in tool", [
            el("span", "name", b.name),
            el("span", "arg", toolArg(b.name, b.input)),
            el("span", "status", "running"),
          ]);
          d.querySelector(".body").append(section("Input", el("div", "input")));
          d.querySelector(".input").append(toolInput(b.name, b.input));
          tools.set(b.id, d);
          add(d, e.timestamp);
        }
      }
    } else if (e.type === "system" && e.subtype === "compact_boundary") {
      add(el("div", "system", "context compacted"), e.timestamp);
    }
  }

  markTails();
  const span = last ? Math.round((Date.parse(last.timestamp) - Date.parse(first.timestamp)) / 60000) : 0;
  $("info").textContent = [first?.cwd, model, `${span} min`, `${tokensOut.toLocaleString()} out tokens`]
    .filter(Boolean).join(" · ");
  $("empty").hidden = true;
}

function parse(text) {
  const lines = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (lines[0].type === "session_meta") return { agent: "Codex", entries: fromCodex(lines) };
  return { agent: "Claude", entries: lines };
}

function isHuman(e) {
  return e.origin?.kind === "human" && !e.isMeta;
}

function firstText(content) {
  if (typeof content === "string") return content;
  return content.find((b) => b.type === "text")?.text;
}

function summarize(lines) {
  let title = "";
  let prompt = "";
  let preview = "";
  let last = 0;
  for (const e of lines) {
    if (e.type === "ai-title") title = e.aiTitle;
    if (!e.timestamp) continue;
    const text = e.type === "assistant" || (e.type === "user" && isHuman(e)) ? firstText(e.message.content) : null;
    if (!text) continue;
    if (e.type === "user") prompt ||= text;
    preview = text;
    last = Date.parse(e.timestamp);
  }
  return { title: title || prompt.slice(0, 80), preview: preview.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").slice(0, 140), last };
}

function listDate(t) {
  const d = new Date(t);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
}

async function openSession(session, item) {
  for (const n of list.children) n.classList.toggle("active", n === item);
  render(parse(await session.file.text()).entries);
  $("name").textContent = session.title;
  $("avatar").className = session.agent;
  chat.scrollTop = 0;
  document.body.classList.add("chatting");
}

function showSessions(sessions) {
  list.replaceChildren();
  for (const session of sessions) {
    const item = el("li", "thread");
    const top = el("div", "thread-top");
    top.append(el("span", "thread-title", session.title), el("span", "thread-date", listDate(session.last)));
    item.append(el("div", "thread-avatar " + session.agent), top, el("div", "thread-preview", session.preview));
    item.onclick = () => openSession(session, item);
    list.append(item);
  }
  list.firstElementChild?.click();
}

async function loadFiles(files) {
  const sessions = [];
  for (const file of files) {
    if (!file.name.endsWith(".jsonl")) continue;
    const { agent, entries } = parse(await file.text());
    if (entries.some((e) => e.isSidechain)) continue;
    const meta = summarize(entries);
    if (meta.last) sessions.push({ file, agent, ...meta });
  }
  sessions.sort((a, b) => b.last - a.last);
  showSessions(sessions);
}

async function entryFiles(entry) {
  if (entry.isFile) {
    return [await new Promise((ok, fail) => entry.file(ok, fail))];
  }
  const reader = entry.createReader();
  const out = [];
  for (;;) {
    const batch = await new Promise((ok, fail) => reader.readEntries(ok, fail));
    if (!batch.length) return out;
    for (const child of batch) out.push(...await entryFiles(child));
  }
}

$("file").onchange = (e) => loadFiles(e.target.files);
$("folder").onchange = (e) => loadFiles(e.target.files);
$("back").onclick = () => document.body.classList.remove("chatting");

document.ondragover = (e) => { e.preventDefault(); document.body.classList.add("over"); };
document.ondragleave = (e) => { if (!e.relatedTarget) document.body.classList.remove("over"); };
document.ondrop = async (e) => {
  e.preventDefault();
  document.body.classList.remove("over");
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry());
  const files = [];
  for (const entry of entries) files.push(...await entryFiles(entry));
  loadFiles(files);
};
