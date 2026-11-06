// `arexi serve`: runs the agent on this computer and serves the phone app (a PWA) that controls it.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "./agent.js";
import { AREXI_HOME, EFFORTS, MODES, loadConfig } from "./config.js";
import { explainError } from "./errors.js";
import { c, line } from "./ui.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const TOKEN_FILE = path.join(AREXI_HOME, "server-token");
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/sw.js": ["sw.js", "text/javascript; charset=utf-8"],
  "/icon.svg": ["icon.svg", "image/svg+xml"],
};
const MAX_EVENTS = 4000;

function parseArgs(argv) {
  const o = { port: 7777, host: "0.0.0.0", overrides: {}, newToken: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") o.port = Number(argv[++i]);
    else if (a === "--host") o.host = argv[++i];
    else if (a === "--full" || a === "--yolo") o.overrides.mode = "full";
    else if (a === "--mode") o.overrides.mode = argv[++i];
    else if (a === "--model") o.overrides.model = argv[++i];
    else if (a === "--effort") o.overrides.effort = argv[++i];
    else if (a === "--new-token") o.newToken = true;
  }
  return o;
}

export function loadToken(regenerate = false) {
  if (!regenerate) {
    try {
      const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
      if (t.length >= 32) return t;
    } catch {}
  }
  const t = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(AREXI_HOME, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
  return t;
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  return out;
}

function sameToken(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (d) => {
      size += d.length;
      if (size > limit) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(d);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

/** Holds the agent, the event log the phone replays on connect, and the connected clients. */
export function createHub(cfg) {
  const clients = new Set();
  let events = [];
  let busy = false;
  let controller = null;
  let pending = null; // { id, resolve, request }

  const broadcast = (ev) => {
    const data = JSON.stringify(ev) + "\n";
    for (const res of clients) res.write(data);
  };

  // Keep the log compact: merge consecutive streaming deltas into one event.
  const record = (ev) => {
    const last = events.at(-1);
    if (last && ["text", "thinking", "tool_output"].includes(ev.type) && last.type === ev.type && last.id === ev.id) {
      last.text += ev.text;
    } else {
      events.push({ ...ev });
      if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    }
  };

  const publish = (ev) => {
    record(ev);
    broadcast(ev);
  };

  const io = {
    emit: publish,
    askPermission(request) {
      return new Promise((resolve) => {
        pending = { id: request.id, resolve, request };
        publish({ type: "permission", id: request.id, name: request.name, kind: request.kind, desc: request.desc, input: request.input });
        controller?.signal.addEventListener("abort", () => answer(request.id, "h"), { once: true });
      });
    },
  };

  const agent = new Agent(cfg, io);

  function state() {
    const cost = agent.costEstimate();
    return {
      type: "state",
      busy,
      mode: cfg.mode,
      effort: cfg.effort,
      model: cfg.model,
      showThinking: cfg.showThinking,
      cwd: agent.ctx.cwd,
      host: os.hostname(),
      usage: agent.usage,
      cost,
      modes: MODES,
      efforts: EFFORTS,
    };
  }

  function answer(id, text) {
    if (!pending || pending.id !== id) return false;
    const p = pending;
    pending = null;
    publish({ type: "permission_resolved", id, answer: text });
    p.resolve(text);
    return true;
  }

  async function send(text) {
    if (busy) return false;
    busy = true;
    controller = new AbortController();
    publish({ type: "user", text });
    broadcast(state());
    line(c.magenta("📱 ") + text.slice(0, 200));
    try {
      await agent.runTurn(text, controller.signal);
    } catch (err) {
      publish({ type: "notice", level: "error", text: explainError(err) });
    } finally {
      busy = false;
      controller = null;
      pending = null;
      publish({ type: "turn_end" });
      broadcast(state());
    }
    return true;
  }

  return {
    agent,
    clients,
    state,
    snapshot: () => ({ type: "snapshot", events, state: state() }),
    send,
    answer,
    stop() {
      if (!controller) return false;
      controller.abort();
      return true;
    },
    settings(body) {
      if (body.mode && MODES[body.mode]) cfg.mode = body.mode;
      if (body.effort && EFFORTS.includes(body.effort)) cfg.effort = body.effort;
      if (typeof body.model === "string" && /^[\w.-]{3,80}$/.test(body.model)) cfg.model = body.model;
      if (typeof body.showThinking === "boolean") cfg.showThinking = body.showThinking;
      broadcast(state());
    },
    clear() {
      if (busy) return false;
      agent.reset();
      events = [];
      for (const res of clients) res.write(JSON.stringify({ type: "snapshot", events, state: state() }) + "\n");
      return true;
    },
  };
}

export function createServer(hub, token) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      try {
        const body = fs.readFileSync(path.join(PUBLIC_DIR, file));
        res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
        return res.end(body);
      } catch {
        return json(404, { error: "not found" });
      }
    }

    if (!url.pathname.startsWith("/api/")) return json(404, { error: "not found" });
    const auth = req.headers.authorization || "";
    if (!sameToken(auth.replace(/^Bearer\s+/i, ""), token)) return json(401, { error: "unauthorized" });

    try {
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" });
        res.write(JSON.stringify(hub.snapshot()) + "\n");
        hub.clients.add(res);
        const ping = setInterval(() => res.write('{"type":"ping"}\n'), 20000);
        req.on("close", () => {
          clearInterval(ping);
          hub.clients.delete(res);
        });
        return;
      }
      if (req.method !== "POST") return json(405, { error: "method not allowed" });
      const body = await readBody(req);
      switch (url.pathname) {
        case "/api/message": {
          const text = String(body.text ?? "").trim();
          if (!text) return json(400, { error: "empty message" });
          if (hub.state().busy) return json(409, { error: "busy" });
          hub.send(text);
          return json(202, { ok: true });
        }
        case "/api/stop":
          return json(200, { ok: hub.stop() });
        case "/api/permission":
          return json(200, { ok: hub.answer(String(body.id), String(body.answer ?? "h")) });
        case "/api/settings":
          hub.settings(body);
          return json(200, hub.state());
        case "/api/clear":
          return json(hub.clear() ? 200 : 409, { ok: true });
        default:
          return json(404, { error: "not found" });
      }
    } catch (err) {
      return json(err.status || 500, { error: err.message });
    }
  });
}

export async function startServer(argv) {
  const opts = parseArgs(argv);
  const cfg = loadConfig(opts.overrides);
  const token = loadToken(opts.newToken);
  const hub = createHub(cfg);
  const server = createServer(hub, token);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, resolve);
  });

  line(c.magenta(c.bold("\n  Arexi telefon sunucusu çalışıyor")));
  line(c.gray(`  mod: ${cfg.mode} · model: ${cfg.model} · dizin: ${process.cwd()}\n`));
  const hosts = opts.host === "0.0.0.0" ? lanAddresses() : [opts.host];
  const links = hosts.map((h) => `http://${h}:${opts.port}/#t=${token}`);
  for (const l of links) line("  " + c.cyan(l));
  if (links[0]) {
    try {
      const qr = (await import("qrcode-terminal")).default;
      line(c.gray("\n  Telefonun kamerasıyla bu kodu okut (telefon ve bilgisayar aynı Wi-Fi'de olmalı):\n"));
      qr.generate(links[0], { small: true }, (code) => line(code.replace(/^/gm, "  ")));
    } catch {}
  }
  line(c.yellow("  ⚠ Bu bağlantıdaki anahtar bilgisayarına erişim verir; kimseyle paylaşma. Yenilemek için: arexi serve --new-token"));
  if (cfg.mode === "full") line(c.red(c.bold("  ⚠ TAM YETKİ MODU: telefondan gelen görevler onay sorulmadan yapılır.")));
  line(c.gray("  Durdurmak için Ctrl+C\n"));
  return server;
}
