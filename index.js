/**
 * index.js — Scaler Website Clone CLI Agent (Powered by Groq)
 *
 * A conversational AI agent that runs in the terminal.
 * It follows a structured reasoning loop (START → THINK → PLAN → TOOL → OBSERVE → OUTPUT)
 * and uses tools to generate a complete clone of the Scaler Academy website.
 *
 * Uses Groq's ultra-fast inference API with Llama models.
 */

import "dotenv/config";
import Groq from "groq-sdk";
import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import { TOOL_MAP, TOOL_DESCRIPTIONS } from "./tools.js";

// ─── Groq Client ────────────────────────────────────────────────────
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ─── Readline interface ─────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askUser(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// ─── Pretty logging helpers ─────────────────────────────────────────

const STEP_STYLES = {
  START:   { icon: "🚀", color: chalk.bold.greenBright,   label: "START"   },
  THINK:   { icon: "🧠", color: chalk.bold.cyanBright,    label: "THINK"   },
  PLAN:    { icon: "📋", color: chalk.bold.yellowBright,   label: "PLAN"    },
  TOOL:    { icon: "🔧", color: chalk.bold.magentaBright,  label: "TOOL"    },
  OBSERVE: { icon: "👁️",  color: chalk.bold.blueBright,    label: "OBSERVE" },
  OUTPUT:  { icon: "✅", color: chalk.bold.green,          label: "OUTPUT"  },
};

function logStep(step, content, extra = "") {
  const style = STEP_STYLES[step] || { icon: "•", color: chalk.white, label: step };
  const header = style.color(`\n${style.icon}  [${style.label}]`);
  console.log(header);
  if (content) {
    console.log(chalk.gray("   " + content.replace(/\n/g, "\n   ")));
  }
  if (extra) {
    console.log(chalk.dim("   " + extra));
  }
}

function printBanner() {
  console.log(chalk.bold.cyanBright(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        🤖  AI Agent CLI — Website Clone Generator  🤖        ║
║              (Powered by Groq + Llama 3.3 70B)              ║
║                                                              ║
║   Describe a website to clone, and the agent will generate   ║
║   working HTML, CSS & JS files step by step.                 ║
║                                                              ║
║   Type ${chalk.yellow("exit")} or ${chalk.yellow("quit")} to leave.                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `));
}

// ─── System prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are an expert web developer AI agent that runs inside a CLI tool.
Your job is to take the user's instruction and build a fully working website
by creating HTML, CSS, and JavaScript files step by step.

You operate in a structured reasoning loop with these steps:
  START   → Acknowledge the user's request and outline what you'll do
  THINK   → Reason about the next sub-task (what to build, what approach to take)
  PLAN    → Break the task into concrete file-creation steps
  TOOL    → Call one of the available tools to perform an action
  OBSERVE → (System-provided) See the result of the tool call
  OUTPUT  → Deliver the final summary to the user

${TOOL_DESCRIPTIONS}

CRITICAL RULES:
1. You MUST respond with a single valid JSON object per message. Nothing else.
2. You MUST do ONE step at a time. After every TOOL step, STOP and wait for the OBSERVE response.
3. You MUST do multiple THINK steps — at least 2 thinking steps before each TOOL call.
4. Do NOT try to write all files in one shot. Create them one by one:
   - First write the CSS file
   - Then write the HTML file
   - Then write the JS file
   - Then verify by reading/listing files
   - Finally open in browser
5. When writing file content, the "content" inside tool_args must be the COMPLETE file content — do NOT use placeholders or "..." abbreviations.
6. After calling a TOOL, wait for the OBSERVE step before proceeding.
7. Only produce the OUTPUT step when ALL files are written and verified.
8. The "tool_args" field is a JSON object with the argument names as keys.

JSON Output Format:
{ "step": "START|THINK|PLAN|TOOL|OUTPUT", "content": "string", "tool_name": "string (only for TOOL step)", "tool_args": { ... } (only for TOOL step) }

EXAMPLE CONVERSATION:

User: Clone the Scaler Academy website
Agent: { "step": "START", "content": "The user wants me to clone the Scaler Academy website. I will create a complete website with Header, Hero Section, and Footer that visually resembles scaler.com. Let me plan this out." }
Agent: { "step": "PLAN", "content": "I will create the following files:\\n1. style.css - All styling\\n2. index.html - Main HTML structure\\n3. script.js - Interactive behaviors\\nI'll start with the CSS file." }
Agent: { "step": "THINK", "content": "For the CSS, I need to replicate Scaler's dark navy/blue color scheme, the gradient effects, modern typography, responsive layout, and their specific component styles for navigation, hero section cards, and footer." }
Agent: { "step": "THINK", "content": "I'll use CSS custom properties for the Scaler brand colors: primary dark (#1a1a2e), accent blue (#4a90d9), and their gradient accents. I'll also add smooth animations." }
Agent: { "step": "TOOL", "tool_name": "writeFile", "tool_args": { "filename": "style.css", "content": "/* full CSS content here */" } }
System: { "step": "OBSERVE", "content": "File style.css written successfully" }
Agent: { "step": "THINK", "content": "CSS is done. Now I need to build the HTML structure with the proper header, hero, and footer sections." }
...continues step by step...
`;

// ─── Agent loop ─────────────────────────────────────────────────────

async function runAgent(userMessage) {
  // Groq uses OpenAI-compatible chat format
  let chatHistory = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let iterationCount = 0;
  const MAX_ITERATIONS = 30; // safety limit

  console.log(chalk.dim("\n─── Agent is working ───────────────────────────────\n"));

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;
    const spinner = ora({
      text: chalk.dim(`Thinking... (step ${iterationCount})`),
      color: "cyan",
    }).start();

    let parsedContent;

    try {
      const chatCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: chatHistory,
        temperature: 0.2,
        max_tokens: 8192,
        response_format: { type: "json_object" },
      });

      const raw = chatCompletion.choices[0]?.message?.content || "{}";
      spinner.stop();

      try {
        parsedContent = JSON.parse(raw);
      } catch {
        console.log(chalk.red("⚠  Agent returned invalid JSON. Retrying..."));
        console.log(chalk.dim(raw.substring(0, 200)));
        
        chatHistory.push({
          role: "assistant",
          content: raw,
        });
        chatHistory.push({
          role: "user",
          content: '{"step":"OBSERVE","content":"Your previous response was not valid JSON. Please respond with a single valid JSON object."}',
        });
        continue;
      }

      // Push assistant message
      chatHistory.push({
        role: "assistant",
        content: JSON.stringify(parsedContent),
      });

      // ─── Handle each step ───
      const step = parsedContent.step?.toUpperCase();

      if (step === "START") {
        logStep("START", parsedContent.content);
      }
      else if (step === "THINK") {
        logStep("THINK", parsedContent.content);
      }
      else if (step === "PLAN") {
        logStep("PLAN", parsedContent.content);
      }
      else if (step === "TOOL") {
        const toolName = parsedContent.tool_name;
        const toolArgs = parsedContent.tool_args || {};

        logStep("TOOL", `Calling ${chalk.yellow(toolName)}`, JSON.stringify(toolArgs).substring(0, 120) + "...");

        if (!TOOL_MAP[toolName]) {
          const errMsg = `Tool "${toolName}" is not available.`;
          logStep("OBSERVE", errMsg);
          chatHistory.push({
            role: "user",
            content: JSON.stringify({ step: "OBSERVE", content: errMsg }),
          });
        } else {
          let result;
          try {
            // Dispatch tool call based on tool name
            if (toolName === "writeFile") {
              result = TOOL_MAP.writeFile(toolArgs.filename, toolArgs.content);
            } else if (toolName === "readFile") {
              result = TOOL_MAP.readFile(toolArgs.filename);
            } else if (toolName === "listFiles") {
              result = TOOL_MAP.listFiles();
            } else if (toolName === "executeCommand") {
              result = await TOOL_MAP.executeCommand(toolArgs.cmd);
            } else if (toolName === "openInBrowser") {
              result = await TOOL_MAP.openInBrowser(toolArgs.filename);
            }
          } catch (e) {
            result = `❌ Tool error: ${e.message}`;
          }

          logStep("OBSERVE", typeof result === "string" ? result.substring(0, 300) : JSON.stringify(result).substring(0, 300));

          chatHistory.push({
            role: "user",
            content: JSON.stringify({ step: "OBSERVE", content: String(result) }),
          });
        }
      }
      else if (step === "OUTPUT") {
        logStep("OUTPUT", parsedContent.content);
        console.log(chalk.dim("\n─── Agent finished ─────────────────────────────────\n"));
        break;
      }
      else {
        console.log(chalk.yellow(`⚠  Unknown step: ${step}`));
      }

    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`\n❌ API Error: ${error.message}`));
      
      if (error.message.includes("invalid_api_key") || error.message.includes("authentication")) {
        console.log(chalk.yellow("💡 Make sure your GROQ_API_KEY is correct in the .env file."));
        break;
      }
      
      // Handle Rate Limit (429) gracefully
      if (error.status === 429 || error.message.includes("429") || error.message.includes("rate_limit")) {
        let waitTime = 15; // Groq rate limits are usually shorter
        const retryAfter = error.headers?.["retry-after"];
        if (retryAfter) {
          waitTime = Math.ceil(parseFloat(retryAfter)) + 2;
        }
        console.log(chalk.yellow(`⏳ Rate limit hit. Waiting for ${waitTime} seconds before retrying...`));
        await new Promise(r => setTimeout(r, waitTime * 1000));
      } else {
        // Wait a bit for other transient errors
        await new Promise(r => setTimeout(r, 3000));
      }
      continue;
    }
  }

  if (iterationCount >= MAX_ITERATIONS) {
    console.log(chalk.yellow("\n⚠  Agent reached maximum iterations. Stopping."));
  }
}

// ─── Main entry point ───────────────────────────────────────────────

async function main() {
  printBanner();

  // Validate API key
  if (!process.env.GROQ_API_KEY) {
    console.log(chalk.red("❌ GROQ_API_KEY is not set!"));
    console.log(chalk.yellow("   Create a .env file with: GROQ_API_KEY=gsk_..."));
    rl.close();
    process.exit(1);
  }

  console.log(chalk.green("✓ Groq API key detected\n"));

  // Interactive chat loop
  while (true) {
    const userInput = await askUser(chalk.bold.cyan("You ▸ "));

    if (!userInput || !userInput.trim()) continue;

    const trimmed = userInput.trim().toLowerCase();
    if (trimmed === "exit" || trimmed === "quit") {
      console.log(chalk.gray("\nGoodbye! 👋\n"));
      rl.close();
      process.exit(0);
    }

    await runAgent(userInput.trim());
  }
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
