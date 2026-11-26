// Converts a pi session (.jsonl, version 3) into Claude Code transcript entries.

function piBlocks(content) {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((c) => (c.type === "image"
    ? { type: "image", source: { media_type: c.mimeType, data: c.data } }
    : { type: "text", text: c.text }));
}

function piText(content) {
  return piBlocks(content).map((b) => (b.type === "text" ? b.text : "[image]")).join("\n");
}

function piSystemText(m) {
  return [m.content, ...Object.values(m.sections ?? {})].filter(Boolean).join("\n\n");
}

function fromPi(lines) {
  const header = lines[0];
  const entries = [];

  for (const line of lines) {
    const base = { timestamp: line.timestamp, cwd: header.cwd };
    const notice = (text, kind) => entries.push({ ...base, type: "user", origin: { kind }, message: { content: text } });
    const usage = (u) => entries.push({ ...base, type: "assistant", message: { id: line.id, content: [], usage: { output_tokens: u.output } } });

    if (line.type === "session_info") entries.push({ type: "ai-title", aiTitle: line.name });
    else if (line.type === "compaction") entries.push({ ...base, type: "system", subtype: "compact_boundary" });
    else if (line.type === "branch_summary") notice(`Branch summary\n${line.summary}`, "branch");
    else if (line.type === "custom_message" && line.display) notice(piText(line.content), line.customType);
    else if (line.type === "usage") usage(line.usage);
    else if (line.type !== "message") continue;
    else if (line.message.role === "user") notice(piText(line.message.content), "human");
    else if (line.message.role === "system") notice(`System prompt\n${piSystemText(line.message)}`, "system");
    else if (line.message.role === "bashExecution") notice(`$ ${line.message.command}\n${line.message.output}`, "bash");
    else if (line.message.role === "custom" && line.message.display) notice(piText(line.message.content), line.message.customType);
    else if (line.message.role === "assistant") {
      const m = line.message;
      const content = m.content.map((b) => {
        if (b.type === "toolCall") return { type: "tool_use", id: b.id, name: b.name, input: b.arguments };
        return b;
      });
      entries.push({ ...base, type: "assistant", message: { id: line.id, model: m.model, content, usage: { output_tokens: m.usage.output } } });
    } else if (line.message.role === "toolResult") {
      const m = line.message;
      entries.push({ ...base, type: "user", message: { content: [{ type: "tool_result", tool_use_id: m.toolCallId, is_error: m.isError, content: piBlocks(m.content) }] } });
    }
  }
  return entries;
}
