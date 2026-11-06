import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTool } from "../src/tools.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arexi-test-"));
const ctx = { cwd: tmp, cfg: { commandTimeoutSec: 30 }, todos: [] };

test("write, read, edit file", async () => {
  let r = await runTool("write_file", { path: "a/b.txt", content: "merhaba\ndünya\nmerhaba" }, ctx);
  assert.ok(!r.error, r.text);
  r = await runTool("read_file", { path: "a/b.txt" }, ctx);
  assert.match(r.text, /2\tdünya/);
  r = await runTool("edit_file", { path: "a/b.txt", old_string: "merhaba", new_string: "selam" }, ctx);
  assert.ok(r.error, "ambiguous edit must fail");
  r = await runTool("edit_file", { path: "a/b.txt", old_string: "merhaba", new_string: "selam", replace_all: true }, ctx);
  assert.ok(!r.error, r.text);
  assert.equal(fs.readFileSync(path.join(tmp, "a/b.txt"), "utf8"), "selam\ndünya\nselam");
  r = await runTool("edit_file", { path: "a/b.txt", old_string: "dünya", new_string: "$& $1" }, ctx);
  assert.equal(fs.readFileSync(path.join(tmp, "a/b.txt"), "utf8"), "selam\n$& $1\nselam", "replacement must be literal");
});

test("glob, grep, list_dir", async () => {
  await runTool("write_file", { path: "src/x.js", content: "const answer = 42;\n" }, ctx);
  let r = await runTool("glob", { pattern: "**/*.js" }, ctx);
  assert.match(r.text, /src\/x\.js/);
  r = await runTool("grep", { pattern: "answer\\s*=" }, ctx);
  assert.match(r.text, /src\/x\.js:1:/);
  r = await runTool("list_dir", {}, ctx);
  assert.match(r.text, /src\//);
});

test("bash runs commands, tracks cd and reports exit codes", { skip: process.platform === "win32" }, async () => {
  let r = await runTool("bash", { command: "echo hello && exit 3" }, ctx);
  assert.match(r.text, /hello/);
  assert.match(r.text, /çıkış kodu: 3/);
  assert.ok(r.error);
  r = await runTool("bash", { command: "cd src" }, ctx);
  assert.equal(ctx.cwd, path.join(tmp, "src"));
  r = await runTool("bash", { command: "ls" }, ctx);
  assert.match(r.text, /x\.js/);
  ctx.cwd = tmp;
});

test("bash timeout and abort", { skip: process.platform === "win32" }, async () => {
  let r = await runTool("bash", { command: "sleep 5", timeout_sec: 0.3 }, ctx);
  assert.match(r.text, /zaman aşımı/);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 200);
  r = await runTool("bash", { command: "sleep 5" }, { ...ctx, signal: ac.signal });
  assert.match(r.text, /durdurdu/);
});

test("invalid input is rejected without running", async () => {
  const r = await runTool("write_file", { path: "z.txt" }, ctx);
  assert.ok(r.error);
  assert.match(r.text, /INVALID_JSON/);
  assert.ok(!fs.existsSync(path.join(tmp, "z.txt")));
});
