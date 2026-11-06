// End-to-end test of the agent loop against a local fake Messages API (no real API key needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { messageEvents, startMockApi } from "./mock-api.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arexi-agent-"));
process.env.AREXI_HOME = path.join(tmp, ".arexi");
process.env.ANTHROPIC_API_KEY = "test-key";

test("agent runs a tool, sends the result back and finishes", async () => {
  const { server, requests } = await startMockApi((n) =>
    n === 1
      ? messageEvents("m1", [{ type: "text", text: "Dosyayı yazıyorum." }, { type: "tool_use", id: "tu_1", name: "write_file", input: { path: "out.txt", content: "Arexi" } }], "tool_use")
      : messageEvents("m2", [{ type: "text", text: "Tamam." }], "end_turn"),
  );

  const { Agent } = await import("../src/agent.js");
  const { loadConfig } = await import("../src/config.js");
  const prevCwd = process.cwd();
  process.chdir(tmp);
  try {
    const agent = new Agent(loadConfig({ mode: "full" }), { askPermission: async () => "e" });
    await agent.runTurn("out.txt dosyasına Arexi yaz", new AbortController().signal);

    assert.equal(fs.readFileSync(path.join(tmp, "out.txt"), "utf8"), "Arexi");
    assert.equal(requests.length, 2);
    const first = requests[0].json;
    assert.equal(first.model, "claude-opus-5-5");
    assert.deepEqual(first.thinking, { type: "adaptive", display: "summarized" });
    assert.equal(first.fallbacks, "default");
    assert.match(requests[0].beta, /server-side-fallback-2026-07-01/);
    assert.ok(first.tools.every((t) => t.type === "web_search_20260209" || t.eager_input_streaming === true));
    const second = requests[1].json.messages;
    assert.equal(second.length, 3);
    assert.equal(second[2].content[0].type, "tool_result");
    assert.equal(second[2].content[0].tool_use_id, "tu_1");
    assert.equal(agent.messages.length, 4);
    assert.ok(fs.readdirSync(path.join(tmp, ".arexi", "sessions")).length === 1, "session saved");
  } finally {
    process.chdir(prevCwd);
    server.close();
  }
});

test("denied tool in ask mode returns an error result with the user's note", async () => {
  const { Agent } = await import("../src/agent.js");
  const { loadConfig } = await import("../src/config.js");
  const agent = new Agent(loadConfig({ mode: "ask" }), { askPermission: async () => "bunun yerine /tmp kullan" });
  const [res] = await agent.executeTools([{ id: "t", name: "bash", input: { command: "echo hi" } }], new AbortController().signal);
  assert.equal(res.is_error, true);
  assert.match(res.content, /reddetti.*\/tmp kullan/);
});

test("repairHistory answers dangling tool_use blocks after an interrupt", async () => {
  const { Agent } = await import("../src/agent.js");
  const { loadConfig } = await import("../src/config.js");
  const agent = new Agent(loadConfig(), { askPermission: async () => "e" });
  agent.messages = [
    { role: "user", content: "x" },
    { role: "assistant", content: [{ type: "tool_use", id: "a", name: "bash", input: {} }] },
  ];
  agent.repairHistory();
  assert.equal(agent.messages.at(-1).content[0].tool_use_id, "a");
});
