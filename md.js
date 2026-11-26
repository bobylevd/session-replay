// Minimal markdown renderer. It builds DOM nodes with textContent only, so input text cannot inject HTML.

const INLINE = /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\s][^*]*?)\*|\b_([^_\s][^_]*?)_\b|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_URL = /^(https?:|mailto:|#)/i;

function node(tag, children = []) {
  const n = document.createElement(tag);
  n.append(...children);
  return n;
}

function inline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out.push(text.slice(last, m.index));
    last = m.index + m[0].length;
    const [, , code, bold, bold2, em, em2, label, url] = m;
    if (code !== undefined) out.push(node("code", [code.trim()]));
    else if (bold ?? bold2) out.push(node("strong", inline(bold ?? bold2)));
    else if (em ?? em2) out.push(node("em", inline(em ?? em2)));
    else if (SAFE_URL.test(url)) {
      const a = node("a", inline(label));
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      out.push(a);
    } else out.push(m[0]);
  }
  out.push(text.slice(last));
  return out.filter((x) => x !== "");
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function cells(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function isBlockStart(line, next) {
  return FENCE.test(line) || HEADING.test(line) || ITEM.test(line) || QUOTE.test(line) || RULE.test(line)
    || (line.includes("|") && TABLE_SEP.test(next ?? ""));
}

function listBlock(lines, i) {
  const base = ITEM.exec(lines[i]);
  const ordered = /\d/.test(base[2]);
  const el = node(ordered ? "ol" : "ul");
  if (ordered) el.start = parseInt(base[2], 10);
  while (i < lines.length) {
    const m = ITEM.exec(lines[i]);
    if (!m || m[1].length !== base[1].length || /\d/.test(m[2]) !== ordered) break;
    const body = [m[3]];
    i++;
    while (i < lines.length && lines[i].trim() && !ITEM.exec(lines[i]) && !isBlockStart(lines[i], lines[i + 1])) {
      body.push(lines[i].trim());
      i++;
    }
    const li = node("li", inline(body.join(" ")));
    const nested = ITEM.exec(lines[i] ?? "");
    if (nested && nested[1].length > base[1].length) {
      const [sub, next] = listBlock(lines, i);
      li.append(sub);
      i = next;
    }
    el.append(li);
  }
  return [el, i];
}

function blocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (FENCE.test(line)) {
      const fence = FENCE.exec(line)[1];
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++;
      out.push(node("pre", [node("code", [body.join("\n")])]));
    } else if (HEADING.test(line)) {
      const [, hashes, text] = HEADING.exec(line);
      out.push(node("h" + hashes.length, inline(text)));
      i++;
    } else if (RULE.test(line)) {
      out.push(node("hr"));
      i++;
    } else if (ITEM.test(line)) {
      const [el, next] = listBlock(lines, i);
      out.push(el);
      i = next;
    } else if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(QUOTE.exec(lines[i++])[1]);
      out.push(node("blockquote", blocks(body)));
    } else if (line.includes("|") && TABLE_SEP.test(lines[i + 1] ?? "")) {
      const head = node("tr", cells(line).map((c) => node("th", inline(c))));
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(node("tr", cells(lines[i++]).map((c) => node("td", inline(c)))));
      }
      out.push(node("table", [node("thead", [head]), node("tbody", rows)]));
    } else {
      const body = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) body.push(lines[i++].trim());
      out.push(node("p", inline(body.join(" "))));
    }
  }
  return out;
}

function renderMarkdown(text) {
  return blocks(text.replace(/\r\n/g, "\n").split("\n"));
}
