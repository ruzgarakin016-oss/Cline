import { styleText } from "node:util";

const color = (fmt) => (s) => (process.stdout.isTTY ? styleText(fmt, String(s)) : String(s));

export const c = {
  dim: color("dim"),
  bold: color("bold"),
  cyan: color("cyan"),
  green: color("green"),
  yellow: color("yellow"),
  red: color("red"),
  magenta: color("magenta"),
  gray: color("gray"),
};

export const out = (s = "") => process.stdout.write(s);
export const line = (s = "") => process.stdout.write(s + "\n");

export function banner(cfg) {
  line(c.magenta(c.bold("\n  ▄▀█ █▀█ █▀▀ ▀▄▀ █\n  █▀█ █▀▄ ██▄ █░█ █")));
  line(c.gray(`  model: ${cfg.model} · effort: ${cfg.effort} · mod: ${cfg.mode}`));
  line(c.gray(`  dizin: ${process.cwd()}`));
  line(c.gray("  /help ile komutları gör · Ctrl+C işlemi durdurur · /exit çıkar\n"));
}

export function truncate(s, max = 400) {
  s = String(s);
  return s.length > max ? s.slice(0, max) + c.gray(` … (+${s.length - max} karakter)`) : s;
}

/** One-line human summary of a tool call. */
export function describeTool(name, input = {}) {
  switch (name) {
    case "bash":
      return `$ ${input.command ?? ""}`;
    case "read_file":
      return `oku ${input.path ?? ""}`;
    case "write_file":
      return `yaz ${input.path ?? ""} (${(input.content ?? "").length} karakter)`;
    case "edit_file":
      return `düzenle ${input.path ?? ""}`;
    case "list_dir":
      return `listele ${input.path ?? "."}`;
    case "glob":
      return `glob ${input.pattern ?? ""}`;
    case "grep":
      return `ara /${input.pattern ?? ""}/ ${input.path ?? ""}`;
    case "web_fetch":
      return `getir ${input.url ?? ""}`;
    case "todo":
      return `görev listesi (${(input.items ?? []).length})`;
    default:
      return `${name} ${JSON.stringify(input)}`;
  }
}
