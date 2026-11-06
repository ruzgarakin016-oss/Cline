// Phone-app server: auth, event stream, sending a task and answering a permission request over HTTP.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { messageEvents, startMockApi } from "./mock-api.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arexi-server-"));
process.env.AREXI_HOME = path.join(tmp, ".arexi");
process.env.ANTHROPIC_API_KEY = "test-key";

test("phone server runs a task end to end with a permission prompt", async () => {
  const api = await startMockApi((n) =>
    n === 1
      ? messageEvents("m1", [{ type: "text", text: "Çalıştırıyorum." }, { type: "tool_use", id: "tu_1", name: "bash", input: { command: "echo telefon" } }], "tool_use")
      : messageEvents("m2", [{ type: "text", text: "Bitti." }], "end_turn"),
  );
  const { createHub, createServer } = await import("../src/server.js");
  const { loadConfig } = await import("../src/config.js");
  const prev = process.cwd();
  process.chdir(tmp);
  const hub = createHub(loadConfig({ mode: "ask" }));
  const server = createServer(hub, "x".repeat(43));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { authorization: "Bearer " + "x".repeat(43), "content-type": "application/json" };

  try {
    assert.equal((await fetch(base + "/")).status, 200, "app page is public");
    assert.equal((await fetch(base + "/api/events")).status, 401, "API needs the token");
    assert.equal((await fetch(base + "/api/events", { headers: { authorization: "Bearer wrong" } })).status, 401);

    const stream = await fetch(base + "/api/events", { headers: auth });
    const reader = stream.body.getReader();
    const events = [];
    let buf = "";
    const waitFor = async (pred) => {
      for (;;) {
        const hit = events.find(pred);
        if (hit) return hit;
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended");
        buf += new TextDecoder().decode(value);
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          events.push(JSON.parse(buf.slice(0, i)));
          buf = buf.slice(i + 1);
        }
      }
    };
    assert.equal((await waitFor((e) => e.type === "snapshot")).events.length, 0);

    assert.equal((await fetch(base + "/api/message", { method: "POST", headers: auth, body: JSON.stringify({ text: "echo çalıştır" }) })).status, 202);
    const perm = await waitFor((e) => e.type === "permission");
    assert.equal(perm.name, "bash");
    assert.equal((await fetch(base + "/api/message", { method: "POST", headers: auth, body: JSON.stringify({ text: "x" }) })).status, 409, "busy");

    await fetch(base + "/api/permission", { method: "POST", headers: auth, body: JSON.stringify({ id: perm.id, answer: "e" }) });
    const end = await waitFor((e) => e.type === "tool_end");
    assert.match(end.text, /telefon/);
    await waitFor((e) => e.type === "turn_end");
    assert.ok(events.some((e) => e.type === "text" && e.text.includes("Bitti")));

    // A reconnecting phone gets the whole conversation back in the snapshot.
    const again = await fetch(base + "/api/events", { headers: auth });
    const reader2 = again.body.getReader();
    const first = (await reader2.read()).value;
    const snap = JSON.parse(new TextDecoder().decode(first).split("\n")[0]);
    assert.equal(snap.type, "snapshot");
    assert.ok(snap.events.some((e) => e.type === "user"));
    assert.equal(snap.state.busy, false);
    assert.equal(api.requests.length, 2);
    reader.cancel();
    reader2.cancel();
  } finally {
    process.chdir(prev);
    server.closeAllConnections();
    server.close();
    api.server.close();
  }
});
