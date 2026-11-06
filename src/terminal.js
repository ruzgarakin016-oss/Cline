import { c, line, out, truncate } from "./ui.js";

/**
 * Terminal front-end for the Agent: renders its events to stdout and asks
 * permission questions through `ask(promptText)`.
 */
export function createTerminalIO(ask) {
  let atLineStart = true;
  const write = (s) => {
    if (!s) return;
    out(s);
    atLineStart = s.endsWith("\n");
  };
  const newline = () => {
    if (!atLineStart) write("\n");
  };

  return {
    emit(ev) {
      switch (ev.type) {
        case "thinking_start":
          newline();
          write(c.gray("✻ "));
          break;
        case "thinking":
          write(c.gray(ev.text));
          break;
        case "thinking_end":
        case "text_end":
          newline();
          break;
        case "text_start":
          newline();
          break;
        case "text":
          write(ev.text);
          break;
        case "server_tool":
          newline();
          write(c.cyan(`⏺ ${ev.name}\n`));
          break;
        case "notice":
          newline();
          write((ev.level === "error" ? c.red : ev.level === "warn" ? c.yellow : c.gray)(`(${ev.text})\n`));
          break;
        case "tool_start":
          newline();
          write(c.cyan(`⏺ ${truncate(ev.desc, 300)}\n`));
          break;
        case "tool_output":
          write(c.gray(ev.text));
          break;
        case "tool_end":
          newline();
          if (ev.denied) write(c.red("  ✗ reddedildi\n"));
          else if (ev.streamed) write(c.gray(`  ⎿ ${ev.text.split("\n").pop()}\n`));
          else write(c.gray("  ⎿ " + truncate(ev.text.replace(/\n/g, "\n    "), 500) + "\n"));
          break;
      }
    },

    async askPermission({ name, kind, input }) {
      newline();
      if (name === "edit_file") {
        line(c.red(truncate("- " + input.old_string.split("\n").join("\n- "), 1200)));
        line(c.green(truncate("+ " + input.new_string.split("\n").join("\n+ "), 1200)));
      } else if (name === "write_file") {
        line(c.gray(truncate(input.content, 800)));
      }
      const label = kind === "exec" ? "komutlar" : "dosya düzenlemeleri";
      const ans = await ask(c.yellow(`İzin veriyor musun? [e]vet / [h]ayır / [t]üm ${label} için evet / ya da ne yapmamı istediğini yaz: `));
      atLineStart = true;
      return ans;
    },
  };
}
