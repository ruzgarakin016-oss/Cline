// Fake Claude Messages API for tests: replies with scripted streamed messages.
import http from "node:http";

const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");

export function messageEvents(id, content, stop_reason) {
  const ev = [{ type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }];
  content.forEach((block, index) => {
    if (block.type === "text") {
      ev.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      ev.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
    } else {
      ev.push({ type: "content_block_start", index, content_block: { ...block, input: {} } });
      ev.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    ev.push({ type: "content_block_stop", index });
  });
  ev.push({ type: "message_delta", delta: { stop_reason }, usage: { output_tokens: 5 } });
  ev.push({ type: "message_stop" });
  return sse(ev);
}

/** Start a fake API. `script(n, requestJson)` returns the SSE body for the n-th request (1-based). */
export async function startMockApi(script) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const json = JSON.parse(body);
      requests.push({ json, beta: req.headers["anthropic-beta"] });
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(script(requests.length, json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  return { server, requests };
}
