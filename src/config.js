import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const AREXI_HOME = process.env.AREXI_HOME || path.join(os.homedir(), ".arexi");
export const CONFIG_FILE = path.join(AREXI_HOME, "config.json");
export const SESSIONS_DIR = path.join(AREXI_HOME, "sessions");

/** Permission modes, from most to least careful. */
export const MODES = {
  ask: "Her dosya yazımı ve komut için onay ister",
  "auto-edit": "Dosya düzenlemelerini otomatik yapar, komutlar için onay ister",
  full: "TAM YETKİ — hiçbir şey için onay istemez",
};

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

const DEFAULTS = {
  model: "claude-opus-5-5",
  effort: "high",
  mode: "ask",
  maxTokens: 64000,
  showThinking: true,
  webSearch: true,
  fallbacks: true,
  compaction: true,
  commandTimeoutSec: 300,
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function loadConfig(overrides = {}) {
  const fromFile = readJson(CONFIG_FILE);
  const fromEnv = {};
  if (process.env.AREXI_MODEL) fromEnv.model = process.env.AREXI_MODEL;
  if (process.env.AREXI_EFFORT) fromEnv.effort = process.env.AREXI_EFFORT;
  if (process.env.AREXI_MODE) fromEnv.mode = process.env.AREXI_MODE;
  const cfg = { ...DEFAULTS, ...fromFile, ...fromEnv, ...overrides };
  if (!MODES[cfg.mode]) cfg.mode = DEFAULTS.mode;
  if (!EFFORTS.includes(cfg.effort)) cfg.effort = DEFAULTS.effort;
  return cfg;
}

export function saveConfig(cfg) {
  fs.mkdirSync(AREXI_HOME, { recursive: true });
  const persist = {};
  for (const key of Object.keys(DEFAULTS)) persist[key] = cfg[key];
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(persist, null, 2));
}
