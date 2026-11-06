import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { SESSIONS_DIR } from "./config.js";
import { buildSystemPrompt } from "./prompt.js";
import { TOOLS, runTool, toolDefinitions } from "./tools.js";
import { describeTool } from "./ui.js";

/** $ per million tokens, for the /cost estimate. */
const PRICES = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-fable-5-1": { in: 10, out: 50 },
};

export class Agent {
  /**
   * @param {object} cfg  config from loadConfig()
   * @param {object} io   front-end hooks (terminal or phone app):
   *   emit(event)                  — stream of UI events (text, thinking, tool_start, tool_output, tool_end, notice…)
   *   askPermission(request)       — resolves to the user's answer: "e" | "h" | "t" | free text
   */
  constructor(cfg, io) {
    this.cfg = cfg;
    this.io = io;
    this.emit = (ev) => io.emit?.(ev);
    this.client = new Anthropic();
    this.ctx = { cwd: process.cwd(), cfg, todos: [] };
    this.messages = [];
    this.alwaysAllow = new Set(); // tool kinds the user allowed for this session
    this.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    this.sessionId = new Date().toISOString().replace(/[:.]/g, "-");
    this.system = buildSystemPrompt(cfg, this.ctx.cwd);
  }

  reset() {
    this.messages = [];
    this.ctx.todos = [];
    this.sessionId = new Date().toISOString().replace(/[:.]/g, "-");
    this.system = buildSystemPrompt(this.cfg, this.ctx.cwd);
  }

  buildRequest() {
    const cfg = this.cfg;
    const req = {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system: [{ type: "text", text: this.system }],
      tools: toolDefinitions(cfg),
      messages: this.messages,
      thinking: { type: "adaptive", display: cfg.showThinking ? "summarized" : "omitted" },
      output_config: { effort: cfg.effort },
      cache_control: { type: "ephemeral" },
      betas: [],
    };
    if (cfg.fallbacks) {
      // If the model declines for policy reasons, the API re-runs the turn on its default fallback model.
      req.betas.push("server-side-fallback-2026-07-01");
      req.fallbacks = "default";
    }
    if (cfg.compaction) {
      // Long sessions: the server summarizes old context instead of failing at the context limit.
      req.betas.push("compact-2026-01-12");
      req.context_management = { edits: [{ type: "compact_20260112" }] };
    }
    return req;
  }

  /** Stream one model response, printing text/thinking live. Returns the final message. */
  async streamOnce(signal) {
    const stream = this.client.beta.messages.stream(this.buildRequest(), { signal });
    let mode = null; // which kind of block is currently streaming
    for await (const ev of stream) {
      if (ev.type === "content_block_start") {
        const t = ev.content_block.type;
        mode = null;
        if (t === "thinking" && this.cfg.showThinking) {
          this.emit({ type: "thinking_start" });
          mode = "thinking";
        } else if (t === "text") {
          this.emit({ type: "text_start" });
          mode = "text";
        } else if (t === "server_tool_use") {
          this.emit({ type: "server_tool", name: ev.content_block.name });
        } else if (t === "compaction") {
          this.emit({ type: "notice", level: "info", text: "bağlam özetleniyor…" });
        }
      } else if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") this.emit({ type: "text", text: ev.delta.text });
        else if (ev.delta.type === "thinking_delta" && mode === "thinking") this.emit({ type: "thinking", text: ev.delta.thinking });
      } else if (ev.type === "content_block_stop" && mode) {
        this.emit({ type: `${mode}_end` });
        mode = null;
      }
    }
    const msg = await stream.finalMessage();
    const u = msg.usage ?? {};
    this.usage.input += u.input_tokens ?? 0;
    this.usage.output += u.output_tokens ?? 0;
    this.usage.cacheRead += u.cache_read_input_tokens ?? 0;
    this.usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    return msg;
  }

  /** Ask the user whether a tool call may run. Returns { ok, note }. */
  async permit(id, name, input) {
    const kind = TOOLS[name]?.kind;
    const mode = this.cfg.mode;
    if (!kind || kind === "read") return { ok: true };
    if (mode === "full") return { ok: true };
    if (kind === "edit" && mode === "auto-edit") return { ok: true };
    if (this.alwaysAllow.has(kind)) return { ok: true };

    const ans = String((await this.io.askPermission({ id, name, kind, input, desc: describeTool(name, input) })) ?? "").trim();
    const a = ans.toLowerCase();
    if (["e", "evet", "y", "yes", ""].includes(a)) return { ok: true };
    if (["t", "tümü", "tumu", "a", "always"].includes(a)) {
      this.alwaysAllow.add(kind);
      return { ok: true };
    }
    if (["h", "hayır", "hayir", "n", "no"].includes(a)) return { ok: false };
    return { ok: false, note: ans };
  }

  async executeTools(blocks, signal) {
    const results = [];
    const allRead = blocks.every((b) => TOOLS[b.name]?.kind === "read");
    const runOne = async (b) => {
      if (signal.aborted) return { type: "tool_result", tool_use_id: b.id, is_error: true, content: "Kullanıcı tarafından durduruldu." };
      this.emit({ type: "tool_start", id: b.id, name: b.name, desc: describeTool(b.name, b.input) });
      const perm = await this.permit(b.id, b.name, b.input ?? {});
      if (!perm.ok) {
        const msg = "Kullanıcı bu işlemi reddetti." + (perm.note ? ` Kullanıcının notu: ${perm.note}` : "");
        this.emit({ type: "tool_end", id: b.id, error: true, denied: true, text: "reddedildi" });
        return { type: "tool_result", tool_use_id: b.id, is_error: true, content: msg };
      }
      const streamOut = b.name === "bash" && !allRead;
      // Tools share this.ctx so a `cd` in bash carries over to later calls.
      this.ctx.signal = signal;
      this.ctx.onOutput = streamOut ? (text) => this.emit({ type: "tool_output", id: b.id, text }) : undefined;
      const res = await runTool(b.name, b.input ?? {}, this.ctx);
      this.emit({ type: "tool_end", id: b.id, error: !!res.error, streamed: streamOut, text: res.text });
      return { type: "tool_result", tool_use_id: b.id, is_error: !!res.error, content: res.text };
    };
    if (allRead) return Promise.all(blocks.map(runOne));
    for (const b of blocks) results.push(await runOne(b));
    return results;
  }

  /** Run one user turn to completion (model ↔ tools loop). */
  async runTurn(userContent, signal) {
    this.messages.push({ role: "user", content: userContent });
    let jsonRetries = 0;
    try {
      while (true) {
        let msg;
        try {
          msg = await this.streamOnce(signal);
          jsonRetries = 0;
        } catch (err) {
          // With eager input streaming, unparseable tool JSON rejects the stream; re-issue a couple of times.
          if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err;
          this.emit({ type: "notice", level: "warn", text: "araç girdisi okunamadı, tekrar deneniyor" });
          continue;
        }

        if (msg.stop_reason === "refusal") {
          this.messages.push({ role: "assistant", content: msg.content });
          const d = msg.stop_details;
          this.emit({ type: "notice", level: "error", text: `Model bu isteği reddetti${d?.category ? ` (${d.category})` : ""}.${d?.explanation ? " " + d.explanation : ""}` });
          return;
        }

        this.messages.push({ role: "assistant", content: msg.content });
        if (msg.stop_reason === "pause_turn" || msg.stop_reason === "compaction") continue;
        if (msg.stop_reason === "model_context_window_exceeded") {
          this.emit({ type: "notice", level: "warn", text: "bağlam penceresi doldu — yeni oturum başlatabilirsin" });
          return;
        }

        const toolUses = msg.content.filter((b) => b.type === "tool_use");
        if (toolUses.length === 0) {
          if (msg.stop_reason === "max_tokens") this.emit({ type: "notice", level: "warn", text: "yanıt max_tokens sınırında kesildi" });
          return;
        }

        let results;
        if (msg.stop_reason === "max_tokens") {
          // Tool input was cut off; don't run it, tell the model so it can retry in smaller pieces.
          results = toolUses.map((b) => ({
            type: "tool_result",
            tool_use_id: b.id,
            is_error: true,
            content: "Araç girdisi max_tokens sınırında kesildi ve çalıştırılmadı. Daha küçük parçalar halinde tekrar dene.",
          }));
        } else {
          results = await this.executeTools(toolUses, signal);
        }
        this.messages.push({ role: "user", content: results });
        if (signal.aborted) return;
      }
    } finally {
      this.repairHistory();
      this.save();
    }
  }

  /** After an interrupt, make sure every tool_use has a tool_result so the next request is valid. */
  repairHistory() {
    const last = this.messages.at(-1);
    if (last?.role !== "assistant" || !Array.isArray(last.content)) return;
    const pending = last.content.filter((b) => b.type === "tool_use");
    if (pending.length === 0) return;
    this.messages.push({
      role: "user",
      content: pending.map((b) => ({ type: "tool_result", tool_use_id: b.id, is_error: true, content: "Kullanıcı tarafından durduruldu." })),
    });
  }

  costEstimate() {
    const p = PRICES[this.cfg.model];
    if (!p) return null;
    const u = this.usage;
    return (u.input * p.in + u.cacheWrite * p.in * 1.25 + u.cacheRead * p.in * 0.1 + u.output * p.out) / 1e6;
  }

  save() {
    try {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      const file = path.join(SESSIONS_DIR, `${this.sessionId}.json`);
      fs.writeFileSync(file, JSON.stringify({ cwd: this.ctx.cwd, model: this.cfg.model, messages: this.messages }));
    } catch {}
  }

  /** Resume the most recent saved session (or a specific id). Returns the id or null. */
  resume(id) {
    let files;
    try {
      files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json")).sort();
    } catch {
      return null;
    }
    const file = id ? files.find((f) => f.startsWith(id)) : files.at(-1);
    if (!file) return null;
    const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), "utf8"));
    this.messages = data.messages ?? [];
    this.sessionId = file.replace(/\.json$/, "");
    if (data.cwd && fs.existsSync(data.cwd)) {
      this.ctx.cwd = data.cwd;
      process.chdir(data.cwd);
    }
    return this.sessionId;
  }
}
