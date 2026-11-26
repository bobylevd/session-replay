// Converts a Codex rollout (.jsonl) into Claude Code transcript entries.

function codexText(content) {
  return content.filter((c) => c.text !== undefined).map((c) => c.text).join("\n");
}

function codexIsHuman(payload) {
  const items = payload.internal_chat_message_metadata_passthrough?.content_item_metadata ?? [];
  return items.length > 0 && items.every((m) => m.provenance?.type === "user");
}

function codexToolOutput(output) {
  if (typeof output === "string") return output;
  return output.map((c) => ({ type: "text", text: c.text ?? JSON.stringify(c) }));
}

function fromCodex(lines) {
  const meta = lines[0].payload;
  const isSidechain = Boolean(meta.parent_thread_id);
  const entries = [];
  let model = "";
  let outputTotal = 0;

  for (const [i, line] of lines.entries()) {
    const p = line.payload;
    const base = { timestamp: line.timestamp, isSidechain, cwd: meta.cwd };
    const user = (content, kind) => entries.push({ ...base, type: "user", origin: { kind }, message: { content } });
    const assistant = (content, usage) => entries.push({ ...base, type: "assistant", message: { id: `codex-${i}`, model, content, usage } });

    if (line.type === "turn_context") model = p.model;
    else if (line.type === "compacted") entries.push({ ...base, type: "system", subtype: "compact_boundary" });
    else if (line.type === "event_msg" && p.type === "token_count" && p.info) {
      const total = p.info.total_token_usage.output_tokens;
      assistant([], { output_tokens: total - outputTotal });
      outputTotal = total;
    } else if (line.type !== "response_item") continue;
    else if (p.type === "message" && p.role === "assistant") assistant([{ type: "text", text: codexText(p.content) }]);
    else if (p.type === "message" && p.role === "user") user(codexText(p.content), codexIsHuman(p) ? "human" : "context");
    else if (p.type === "message") user(codexText(p.content), p.role);
    else if (p.type === "agent_message") user(`Agent message ${p.author} → ${p.recipient}\n${codexText(p.content)}`, "agent");
    else if (p.type === "reasoning" && p.summary.length) {
      assistant([{ type: "thinking", thinking: p.summary.map((s) => s.text).join("\n\n") }]);
    } else if (p.type === "custom_tool_call") {
      assistant([{ type: "tool_use", id: p.call_id, name: p.name, input: { input: p.input } }]);
    } else if (p.type === "function_call") {
      const name = p.namespace ? `${p.namespace}.${p.name}` : p.name;
      assistant([{ type: "tool_use", id: p.call_id, name, input: JSON.parse(p.arguments) }]);
    } else if (p.type === "custom_tool_call_output" || p.type === "function_call_output") {
      entries.push({ ...base, type: "user", message: { content: [{ type: "tool_result", tool_use_id: p.call_id, content: codexToolOutput(p.output) }] } });
    }
  }
  return entries;
}
