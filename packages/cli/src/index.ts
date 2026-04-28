#!/usr/bin/env node
import { Command } from "commander";
import { ClaudeProcess } from "@cat-noodle/provider-claude";
import type {
  StreamEvent,
  AssistantEvent,
  ResultEvent,
  ContentBlock,
  SystemEvent,
} from "@cat-noodle/core";

const program = new Command();
program
  .name("cat-noodle")
  .description("Cat Noodle — 多 Agent CLI 管理器")
  .version("0.1.0");

// ========== chat ==========

program
  .command("chat")
  .description("发送消息给 Claude")
  .argument("<message>", "消息内容")
  .option("-r, --resume <sessionId>", "恢复指定 session")
  .option("-s, --system-prompt <prompt>", "系统提示词")
  .option("--no-stream", "只显示最终结果")
  .action(async (message: string, opts: { resume?: string; systemPrompt?: string; stream?: boolean }) => {
    const claude = new ClaudeProcess({ systemPrompt: opts.systemPrompt });
    if (opts.resume) claude.sessionId = opts.resume;

    const showStream = opts.stream !== false;
    let fullText = "";

    try {
      for await (const event of claude.send(message)) {
        if (event.type === "system" && (event as SystemEvent).session_id) {
          // session init，静默处理
          continue;
        }

        if (event.type === "assistant") {
          const ae = event as AssistantEvent;
          for (const block of ae.message.content) {
            if (block.type === "thinking" && showStream) {
              process.stderr.write(`\x1b[2m💭 ${(block as { thinking: string }).thinking.slice(0, 100)}...\x1b[0m\n`);
            } else if (block.type === "text") {
              const text = (block as { text: string }).text;
              if (showStream) process.stdout.write(text);
              fullText += text;
            } else if (block.type === "tool_use" && showStream) {
              const tb = block as { name: string };
              process.stderr.write(`\x1b[33m🔧 ${tb.name}()\x1b[0m\n`);
            }
          }
        } else if (event.type === "result") {
          const re = event as ResultEvent;
          if (!fullText && re.result) {
            process.stdout.write(re.result);
            fullText = re.result;
          }
          const cost = re.total_cost_usd?.toFixed(4);
          const usage = re.usage;
          const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
          process.stderr.write(
            [
              "",
              "\x1b[36m---\x1b[0m",
              `\x1b[90mSession: ${re.session_id}\x1b[0m`,
              `\x1b[90mTokens: ${input} in / ${usage.output_tokens} out\x1b[0m`,
              `\x1b[90mCost: $${cost}\x1b[0m`,
              `\x1b[90mTime: ${re.duration_ms}ms\x1b[0m`,
              "",
            ].join("\n"),
          );
        } else if (event.type === "error") {
          process.stderr.write(`\x1b[31m❌ ${(event as { message: string }).message}\x1b[0m\n`);
          process.exit(1);
        }
      }

      if (claude.sessionId) {
        process.stderr.write(`\x1b[90mResume: npx tsx packages/cli/src/index.ts chat --resume ${claude.sessionId} "<message>"\x1b[0m\n`);
      }
    } catch (err: unknown) {
      process.stderr.write(`\x1b[31m❌ ${err instanceof Error ? err.message : String(err)}\x1b[0m\n`);
      process.exit(1);
    }
  });

program.parse();
