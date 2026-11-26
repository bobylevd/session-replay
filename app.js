const $ = (id) => document.getElementById(id);
const log = $("log");
const drop = $("drop");

const MAX_GAP_MS = 2500;
const MIN_GAP_MS = 120;

let events = [];
let shown = 0;
let timer = null;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function markdown(text) {
  const node = el("div", "assistant");
  node.innerHTML = DOMPurify.sanitize(marked.parse(text));
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

function userText(text, isMeta) {
  if (isMeta) {
    const d = details("meta-msg", [el("span", "", "meta: " + text.split("\n")[0].slice(0, 100))]);
    d.querySelector(".body").append(el("pre", "", text));
    return d;
  }
  const node = el("div", "user");
  node.append(el("pre", "", text));
  return node;
}

function render(lines) {
  log.replaceChildren();
  events = [];
  const tools = new Map();
  let title = "";
  let model = "";
  let tokensOut = 0;
  let first = null;
  let last = null;

  const push = (node, ts, parent = log) => {
    parent.append(node);
    events.push({ node, ts: Date.parse(ts) });
  };

  for (const e of lines) {
    if (e.type === "ai-title") title = e.aiTitle ?? e.title ?? title;
    if (e.type === "summary") title = e.summary;
    if (!e.timestamp) continue;
    if (e.type === "user") {
      first ??= e;
      last = e;
      const c = e.message.content;
      if (typeof c === "string") push(userText(c, e.isMeta), e.timestamp);
      else for (const b of c) {
        if (b.type === "tool_result") {
          const card = tools.get(b.tool_use_id);
          card.classList.toggle("error", !!b.is_error);
          card.querySelector(".status").textContent = b.is_error ? "error" : "done";
          push(toolResult(b), e.timestamp, card.querySelector(".body"));
        } else if (b.type === "text") push(userText(b.text, e.isMeta), e.timestamp);
      }
    } else if (e.type === "assistant") {
      last = e;
      model = e.message.model;
      tokensOut += e.message.usage?.output_tokens ?? 0;
      for (const b of e.message.content) {
        if (b.type === "text") push(markdown(b.text), e.timestamp);
        else if (b.type === "thinking") {
          const d = details("thinking", [el("span", "", "Thinking")]);
          d.querySelector(".body").textContent = b.thinking;
          push(d, e.timestamp);
        } else if (b.type === "tool_use") {
          const d = details("tool", [
            el("span", "name", b.name),
            el("span", "arg", toolArg(b.name, b.input)),
            el("span", "status", "running"),
          ]);
          d.querySelector(".body").append(section("Input", el("div", "input")));
          d.querySelector(".input").append(toolInput(b.name, b.input));
          tools.set(b.id, d);
          push(d, e.timestamp);
        }
      }
    } else if (e.type === "system" && e.subtype === "compact_boundary") {
      push(el("div", "system", "context compacted"), e.timestamp);
    }
  }

  const span = last ? Math.round((Date.parse(last.timestamp) - Date.parse(first.timestamp)) / 60000) : 0;
  $("info").textContent = [title, first?.cwd, model, `${span} min`, `${tokensOut.toLocaleString()} out tokens`]
    .filter(Boolean).join(" · ");
  $("picker").hidden = true;
  $("controls").hidden = false;
  $("scrub").max = events.length;
  seek(0);
}

function seek(n) {
  shown = n;
  events.forEach((ev, i) => { ev.node.hidden = i >= n; });
  $("scrub").value = n;
  $("pos").textContent = `${n} / ${events.length}`;
}

function step() {
  if (shown >= events.length) return pause();
  seek(shown + 1);
  events[shown - 1].node.scrollIntoView({ block: "end", behavior: "smooth" });
}

function tick() {
  step();
  if (shown >= events.length) return;
  const gap = events[shown].ts - events[shown - 1].ts;
  const speed = Number($("speed").value);
  timer = setTimeout(tick, Math.max(MIN_GAP_MS, Math.min(gap, MAX_GAP_MS)) / speed);
}

function play() {
  if (shown >= events.length) seek(0);
  $("play").textContent = "Pause";
  tick();
}

function pause() {
  clearTimeout(timer);
  timer = null;
  $("play").textContent = "Play";
}

async function load(file) {
  pause();
  const text = await file.text();
  const lines = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  render(lines);
}

$("play").onclick = () => (timer ? pause() : play());
$("step").onclick = () => { pause(); step(); };
$("all").onclick = () => { pause(); seek(events.length); };
$("scrub").oninput = (e) => { pause(); seek(Number(e.target.value)); };
$("file").onchange = (e) => load(e.target.files[0]);

drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  load(e.dataTransfer.files[0]);
};
