#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { Agent } from "../src/agent.js";
import { explainError } from "../src/errors.js";
import { createTerminalIO } from "../src/terminal.js";
import { EFFORTS, MODES, loadConfig, saveConfig } from "../src/config.js";
import { runTool } from "../src/tools.js";
import { banner, c, line } from "../src/ui.js";

const HELP = `
Kullanım: arexi [seçenekler] [görev]
         arexi serve [--port 7777] [--host 0.0.0.0] [--full]   Telefon uygulaması sunucusunu başlat

Seçenekler:
  --full                 Tam yetki modu (hiçbir işlem için onay istemez)
  --mode <mod>           ask | auto-edit | full
  --model <id>           Model (varsayılan claude-opus-5-5)
  --effort <seviye>      low | medium | high | xhigh | max
  -p, --print <görev>    Görevi çalıştır, bitince çık (etkileşimsiz)
  -c, --continue         Son oturumdan devam et
  -h, --help             Bu yardım

Sohbet içi komutlar:
  /help                  Komutları göster
  /mode [mod]            İzin modunu göster/değiştir (ask, auto-edit, full)
  /full                  Tam yetki moduna geç
  /effort [seviye]       Düşünme derinliği (low…max)
  /model [id]            Modeli değiştir
  /think                 Düşünce özetlerini aç/kapat
  /init                  Projeyi incele ve AREXI.md hafıza dosyası oluştur
  /todos                 Görev listesini göster
  /cost                  Token kullanımı ve tahmini maliyet
  /clear                 Yeni oturum başlat
  /resume [id]           Kayıtlı oturuma devam et
  /save                  Mevcut ayarları varsayılan olarak kaydet
  /exit                  Çık
  !<komut>               Kabuk komutunu doğrudan çalıştır
  Satır sonuna \\ koyarak çok satırlı mesaj yazabilirsin.
`;

function parseArgs(argv) {
  const opts = { overrides: {}, prompt: null, cont: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--full" || a === "--yolo") opts.overrides.mode = "full";
    else if (a === "--mode") opts.overrides.mode = argv[++i];
    else if (a === "--model") opts.overrides.model = argv[++i];
    else if (a === "--effort") opts.overrides.effort = argv[++i];
    else if (a === "-p" || a === "--print") opts.prompt = argv[++i];
    else if (a === "-c" || a === "--continue") opts.cont = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else rest.push(a);
  }
  if (!opts.prompt && rest.length) opts.initial = rest.join(" ");
  return opts;
}

async function main() {
  if (process.argv[2] === "serve") {
    const { startServer } = await import("../src/server.js");
    return startServer(process.argv.slice(3));
  }
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return void line(HELP);
  const cfg = loadConfig(opts.overrides);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  let controller = null; // set while a turn is running
  let lastSigint = 0;

  // Line queue: rl.question() drops lines that arrive while no question is pending (e.g. piped input).
  const queued = [];
  const waiters = [];
  let closed = false;
  rl.on("line", (l) => (waiters.length ? waiters.shift().resolve(l) : queued.push(l)));
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift().reject(new Error("stdin kapandı"));
  });
  const nextLine = (promptText, signal) => {
    process.stdout.write(promptText);
    if (queued.length) return Promise.resolve(queued.shift());
    if (closed) return Promise.reject(new Error("stdin kapandı"));
    return new Promise((resolve, reject) => {
      const w = { resolve, reject };
      waiters.push(w);
      signal?.addEventListener("abort", () => {
        waiters.splice(waiters.indexOf(w), 1);
        reject(Object.assign(new Error("Durduruldu"), { name: "AbortError" }));
      }, { once: true });
    });
  };

  const io = createTerminalIO((q) => {
    if (opts.prompt && !process.stdin.isTTY) return Promise.resolve("h");
    return nextLine(q, controller?.signal);
  });
  const agent = new Agent(cfg, io);

  rl.on("SIGINT", () => {
    if (controller && !controller.signal.aborted) {
      controller.abort();
      line(c.yellow("\n⏹  durduruluyor…"));
      return;
    }
    if (Date.now() - lastSigint < 1500) {
      rl.close();
      process.exit(0);
    }
    lastSigint = Date.now();
    line(c.gray("\n(çıkmak için tekrar Ctrl+C veya /exit)"));
  });

  const runTurn = async (content) => {
    controller = new AbortController();
    try {
      await agent.runTurn(content, controller.signal);
    } catch (err) {
      line(c.red("\n" + explainError(err)));
    } finally {
      controller = null;
    }
  };

  if (opts.cont) {
    const id = agent.resume();
    if (id) line(c.gray(`Oturuma devam ediliyor: ${id}`));
  }

  if (opts.prompt) {
    await runTurn(opts.prompt);
    rl.close();
    return;
  }

  banner(cfg);
  if (cfg.mode === "full") line(c.red(c.bold("  ⚠ TAM YETKİ MODU: Arexi komutları ve dosya değişikliklerini onay sormadan yapar.\n")));
  if (opts.initial) await runTurn(opts.initial);

  while (true) {
    let input;
    try {
      input = await nextLine(c.magenta("\n❯ "));
      while (input.endsWith("\\")) input = input.slice(0, -1) + "\n" + (await nextLine(c.magenta("… ")));
    } catch {
      break; // stdin closed
    }
    input = input.trim();
    if (!input) continue;

    if (input.startsWith("!")) {
      controller = new AbortController();
      agent.ctx.signal = controller.signal;
      agent.ctx.onOutput = (s) => process.stdout.write(s);
      const res = await runTool("bash", { command: input.slice(1) }, agent.ctx);
      line(c.gray(res.text.split("\n").pop()));
      controller = null;
      continue;
    }

    if (input.startsWith("/")) {
      const [cmd, ...args] = input.slice(1).split(/\s+/);
      const arg = args.join(" ");
      switch (cmd) {
        case "help":
          line(HELP);
          break;
        case "exit":
        case "quit":
          rl.close();
          return;
        case "full":
          cfg.mode = "full";
          line(c.red("Tam yetki modu açık: onay sorulmayacak."));
          break;
        case "mode":
          if (arg && MODES[arg]) cfg.mode = arg;
          else if (arg) line(c.red(`Geçersiz mod. Seçenekler: ${Object.keys(MODES).join(", ")}`));
          for (const [k, v] of Object.entries(MODES)) line(`${k === cfg.mode ? c.green("●") : " "} ${k.padEnd(10)} ${c.gray(v)}`);
          break;
        case "effort":
          if (EFFORTS.includes(arg)) cfg.effort = arg;
          line(`effort: ${cfg.effort}  ${c.gray("(" + EFFORTS.join(" | ") + ")")}`);
          break;
        case "model":
          if (arg) cfg.model = arg;
          line(`model: ${cfg.model}`);
          break;
        case "think":
          cfg.showThinking = !cfg.showThinking;
          line(`düşünce özetleri: ${cfg.showThinking ? "açık" : "kapalı"}`);
          break;
        case "todos":
          line(agent.ctx.todos.map((t) => `${{ pending: "[ ]", in_progress: "[~]", done: "[x]" }[t.status]} ${t.text}`).join("\n") || "(görev yok)");
          break;
        case "cost": {
          const u = agent.usage;
          const cost = agent.costEstimate();
          line(`girdi: ${u.input} · çıktı: ${u.output} · önbellek okuma: ${u.cacheRead} · önbellek yazma: ${u.cacheWrite}`);
          if (cost !== null) line(`tahmini maliyet: $${cost.toFixed(4)}`);
          break;
        }
        case "clear":
          agent.reset();
          line(c.gray("Yeni oturum başladı."));
          break;
        case "resume": {
          const id = agent.resume(arg || undefined);
          line(id ? `Devam ediliyor: ${id} (${agent.messages.length} mesaj)` : "Kayıtlı oturum bulunamadı.");
          break;
        }
        case "save":
          saveConfig(cfg);
          line(c.gray("Ayarlar kaydedildi."));
          break;
        case "init": {
          const target = path.join(agent.ctx.cwd, "AREXI.md");
          const exists = fs.existsSync(target);
          await runTurn(
            `Bu projeyi incele (yapı, diller, derleme/test komutları, kod stili, önemli klasörler) ve ${target} dosyasını ` +
              `${exists ? "güncelle" : "oluştur"}. Bu dosya gelecekteki oturumlarda sana proje hafızası olarak verilecek; ` +
              `kısa, somut ve işe yarar tut.`,
          );
          line(c.gray("AREXI.md bir sonraki oturumda (/clear sonrası) hafızaya yüklenecek."));
          break;
        }
        default:
          line(c.red(`Bilinmeyen komut: /${cmd}  (/help)`));
      }
      continue;
    }

    await runTurn(input);
  }
  rl.close();
}

main().catch((err) => {
  console.error(explainError(err));
  process.exit(1);
});
