import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { z } from "zod";

const MAX_OUTPUT = 30000;
const IGNORE = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.venv/**"];

const clip = (s, max = MAX_OUTPUT) =>
  s.length > max ? s.slice(0, max / 2) + `\n… [${s.length - max} karakter kesildi] …\n` + s.slice(-max / 2) : s;

const resolvePath = (p, ctx) => path.resolve(ctx.cwd, p.replace(/^~(?=$|[\\/])/, process.env.HOME || process.env.USERPROFILE || "~"));

function pickShell() {
  if (process.platform === "win32") return "powershell.exe";
  return existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh";
}

/**
 * Each tool: `def` is sent to the API, `schema` validates the model's input
 * before running (inputs are streamed eagerly, so the server doesn't validate),
 * `kind` drives the permission check: read | edit | exec.
 */
export const TOOLS = {
  bash: {
    kind: "exec",
    def: {
      name: "bash",
      description:
        "Kullanıcının bilgisayarında bir kabuk komutu çalıştırır (Linux/macOS: bash, Windows: PowerShell). " +
        "Program kurma, derleme, test, git, süreç yönetimi, sistem bilgisi, uygulama açma gibi her şey için kullan. " +
        "Komut mevcut çalışma dizininde çalışır; stdout, stderr ve çıkış kodu döner. Etkileşimli komutlardan kaçın.",
      input_schema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Çalıştırılacak komut" },
          timeout_sec: { type: "number", description: "Zaman aşımı (saniye), varsayılan 300" },
        },
        required: ["command"],
      },
    },
    schema: z.object({ command: z.string().min(1), timeout_sec: z.number().positive().optional() }),
    run: ({ command, timeout_sec }, ctx) =>
      new Promise((resolve) => {
        const timeoutMs = (timeout_sec ?? ctx.cfg.commandTimeoutSec) * 1000;
        const child = spawn(command, { cwd: ctx.cwd, shell: pickShell(), env: process.env, windowsHide: true });
        let stdout = "";
        let stderr = "";
        let killedBy = null;
        const kill = (why) => {
          killedBy = why;
          child.kill(process.platform === "win32" ? undefined : "SIGTERM");
        };
        const timer = setTimeout(() => kill("zaman aşımı"), timeoutMs);
        const onAbort = () => kill("kullanıcı durdurdu");
        ctx.signal?.addEventListener("abort", onAbort, { once: true });
        child.stdout.on("data", (d) => {
          stdout += d;
          ctx.onOutput?.(String(d));
        });
        child.stderr.on("data", (d) => {
          stderr += d;
          ctx.onOutput?.(String(d));
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          resolve({ error: true, text: `Komut başlatılamadı: ${err.message}` });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          ctx.signal?.removeEventListener("abort", onAbort);
          let text = "";
          if (stdout) text += `<stdout>\n${clip(stdout)}\n</stdout>\n`;
          if (stderr) text += `<stderr>\n${clip(stderr)}\n</stderr>\n`;
          text += `çıkış kodu: ${code}`;
          if (killedBy) text += ` (${killedBy})`;
          // Track `cd` so the next command starts where the model expects.
          const m = command.trim().match(/^cd\s+("?)([^"&;|]+)\1\s*$/);
          if (m && code === 0) ctx.cwd = resolvePath(m[2].trim(), ctx);
          resolve({ error: code !== 0, text });
        });
      }),
  },

  read_file: {
    kind: "read",
    def: {
      name: "read_file",
      description: "Bir metin dosyasını satır numaralarıyla okur. Büyük dosyalarda offset/limit kullan.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          offset: { type: "number", description: "Başlangıç satırı (1'den başlar)" },
          limit: { type: "number", description: "Okunacak satır sayısı (varsayılan 2000)" },
        },
        required: ["path"],
      },
    },
    schema: z.object({ path: z.string().min(1), offset: z.number().int().positive().optional(), limit: z.number().int().positive().optional() }),
    async run({ path: p, offset = 1, limit = 2000 }, ctx) {
      const text = await fs.readFile(resolvePath(p, ctx), "utf8");
      const lines = text.split("\n");
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const body = slice.map((l, i) => `${String(offset + i).padStart(6)}\t${l}`).join("\n");
      const more = offset - 1 + limit < lines.length ? `\n… (toplam ${lines.length} satır)` : "";
      return { text: clip(body) + more };
    },
  },

  write_file: {
    kind: "edit",
    def: {
      name: "write_file",
      description: "Bir dosyayı verilen içerikle oluşturur veya tamamen üzerine yazar. Gerekirse klasörleri oluşturur.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string", description: "Dosyanın tam içeriği" } },
        required: ["path", "content"],
      },
    },
    schema: z.object({ path: z.string().min(1), content: z.string() }),
    async run({ path: p, content }, ctx) {
      const abs = resolvePath(p, ctx);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
      return { text: `${abs} yazıldı (${content.split("\n").length} satır).` };
    },
  },

  edit_file: {
    kind: "edit",
    def: {
      name: "edit_file",
      description:
        "Bir dosyada old_string metnini new_string ile değiştirir. old_string dosyada tam olarak (boşluklar dahil) ve tek bir kez geçmeli; " +
        "birden fazla yerde değiştirmek için replace_all=true ver. Düzenlemeden önce dosyayı oku.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
          replace_all: { type: "boolean" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
    schema: z.object({ path: z.string().min(1), old_string: z.string().min(1), new_string: z.string(), replace_all: z.boolean().optional() }),
    async run({ path: p, old_string, new_string, replace_all }, ctx) {
      const abs = resolvePath(p, ctx);
      const text = await fs.readFile(abs, "utf8");
      const count = text.split(old_string).length - 1;
      if (count === 0) return { error: true, text: "old_string dosyada bulunamadı. Dosyayı tekrar oku ve tam metni kopyala." };
      if (count > 1 && !replace_all)
        return { error: true, text: `old_string ${count} kez geçiyor. Daha fazla bağlam ekle veya replace_all=true kullan.` };
      const updated = replace_all ? text.split(old_string).join(new_string) : text.replace(old_string, () => new_string);
      await fs.writeFile(abs, updated);
      return { text: `${abs} düzenlendi (${replace_all ? count : 1} değişiklik).` };
    },
  },

  list_dir: {
    kind: "read",
    def: {
      name: "list_dir",
      description: "Bir klasörün içeriğini listeler (klasörler / ile biter).",
      input_schema: { type: "object", properties: { path: { type: "string" } }, required: [] },
    },
    schema: z.object({ path: z.string().optional() }),
    async run({ path: p = "." }, ctx) {
      const entries = await fs.readdir(resolvePath(p, ctx), { withFileTypes: true });
      const names = entries
        .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
        .sort((a, b) => Number(b.endsWith("/")) - Number(a.endsWith("/")) || a.localeCompare(b));
      return { text: names.join("\n") || "(boş klasör)" };
    },
  },

  glob: {
    kind: "read",
    def: {
      name: "glob",
      description: "Glob deseniyle dosya bulur (ör. src/**/*.ts). node_modules ve .git yok sayılır.",
      input_schema: {
        type: "object",
        properties: { pattern: { type: "string" }, path: { type: "string", description: "Arama kökü, varsayılan çalışma dizini" } },
        required: ["pattern"],
      },
    },
    schema: z.object({ pattern: z.string().min(1), path: z.string().optional() }),
    async run({ pattern, path: p = "." }, ctx) {
      const files = await fg(pattern, { cwd: resolvePath(p, ctx), ignore: IGNORE, dot: true, onlyFiles: true });
      files.sort();
      const shown = files.slice(0, 500);
      return { text: (shown.join("\n") || "(eşleşme yok)") + (files.length > 500 ? `\n… (+${files.length - 500} dosya)` : "") };
    },
  },

  grep: {
    kind: "read",
    def: {
      name: "grep",
      description: "Dosya içeriklerinde düzenli ifade (regex) arar ve dosya:satır: içerik döner.",
      input_schema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "JavaScript regex" },
          path: { type: "string", description: "Arama kökü veya tek dosya" },
          glob: { type: "string", description: "Dosya filtresi, ör. **/*.js" },
          ignore_case: { type: "boolean" },
        },
        required: ["pattern"],
      },
    },
    schema: z.object({ pattern: z.string().min(1), path: z.string().optional(), glob: z.string().optional(), ignore_case: z.boolean().optional() }),
    async run({ pattern, path: p = ".", glob = "**/*", ignore_case }, ctx) {
      const re = new RegExp(pattern, ignore_case ? "i" : "");
      const root = resolvePath(p, ctx);
      const stat = await fs.stat(root);
      const files = stat.isFile() ? [root] : (await fg(glob, { cwd: root, ignore: IGNORE, dot: true, absolute: true, onlyFiles: true })).sort();
      const hits = [];
      for (const f of files) {
        let text;
        try {
          const buf = await fs.readFile(f);
          if (buf.length > 2_000_000 || buf.subarray(0, 8000).includes(0)) continue; // skip big/binary
          text = buf.toString("utf8");
        } catch {
          continue;
        }
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            hits.push(`${path.relative(ctx.cwd, f) || f}:${i + 1}: ${lines[i].slice(0, 300)}`);
            if (hits.length >= 300) return { text: hits.join("\n") + "\n… (ilk 300 eşleşme)" };
          }
        }
      }
      return { text: hits.join("\n") || "(eşleşme yok)" };
    },
  },

  web_fetch: {
    kind: "read",
    def: {
      name: "web_fetch",
      description: "Bir URL'yi indirir ve metnini döner (HTML etiketleri temizlenir).",
      input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
    schema: z.object({ url: z.string().url() }),
    async run({ url }, ctx) {
      const res = await fetch(url, { signal: ctx.signal, headers: { "user-agent": "Arexi/0.1" } });
      let body = await res.text();
      if ((res.headers.get("content-type") || "").includes("html")) {
        body = body
          .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/[ \t]+/g, " ")
          .replace(/\n\s*\n+/g, "\n\n");
      }
      return { error: !res.ok, text: `HTTP ${res.status}\n\n${clip(body.trim(), 40000)}` };
    },
  },

  todo: {
    kind: "read",
    def: {
      name: "todo",
      description: "Çok adımlı işlerde görev listesini yazar/günceller. Her çağrıda listenin tamamını gönder.",
      input_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { text: { type: "string" }, status: { type: "string", enum: ["pending", "in_progress", "done"] } },
              required: ["text", "status"],
            },
          },
        },
        required: ["items"],
      },
    },
    schema: z.object({ items: z.array(z.object({ text: z.string(), status: z.enum(["pending", "in_progress", "done"]) })) }),
    async run({ items }, ctx) {
      ctx.todos = items;
      const mark = { pending: "[ ]", in_progress: "[~]", done: "[x]" };
      return { text: items.map((t) => `${mark[t.status]} ${t.text}`).join("\n") || "(boş)" };
    },
  },
};

/** Tool definitions for the API request, in a stable order (keeps the prompt cache warm). */
export function toolDefinitions(cfg) {
  const defs = Object.values(TOOLS).map((t) => ({ ...t.def, eager_input_streaming: true }));
  if (cfg.webSearch) defs.push({ type: "web_search_20260209", name: "web_search" });
  return defs;
}

/** Validate and run one tool call. Never throws: errors become error results. */
export async function runTool(name, input, ctx) {
  const tool = TOOLS[name];
  if (!tool) return { error: true, text: `Bilinmeyen araç: ${name}` };
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) return { error: true, text: JSON.stringify({ INVALID_JSON: JSON.stringify(input), issues: parsed.error.issues }) };
  try {
    return await tool.run(parsed.data, ctx);
  } catch (err) {
    return { error: true, text: `Hata: ${err.message}` };
  }
}
