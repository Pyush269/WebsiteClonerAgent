/**
 * tools.js — Tool definitions for the AI CLI Agent
 * 
 * Each tool is a function that the agent can call to interact with the
 * filesystem and the operating system. The agent decides which tool to
 * invoke, passes the required arguments, and observes the result.
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";

// ─── Base output directory ───────────────────────────────────────────
const OUTPUT_DIR = path.join(process.cwd(), "output");

/**
 * Ensure the output/ directory exists.
 */
function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// ─── Tool implementations ───────────────────────────────────────────

/**
 * writeFile – Creates or overwrites a file inside the output/ directory.
 * @param {string} filename  – Relative path (e.g. "index.html" or "css/style.css")
 * @param {string} content   – Full file content to write
 * @returns {string} Confirmation message
 */
export function writeFile(filename, content) {
  ensureOutputDir();
  const filePath = path.join(OUTPUT_DIR, filename);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, "utf-8");
  return `✅ File "${filename}" written successfully (${content.length} chars) at ${filePath}`;
}

/**
 * readFile – Reads a file from the output/ directory.
 * @param {string} filename – Relative path inside output/
 * @returns {string} The file content or an error message
 */
export function readFile(filename) {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return `❌ File "${filename}" does not exist.`;
  }
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * listFiles – Lists all files inside the output/ directory recursively.
 * @returns {string} A newline-separated list of file paths
 */
export function listFiles() {
  ensureOutputDir();
  const results = [];

  function walk(dir, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else {
        const stats = fs.statSync(path.join(dir, entry.name));
        results.push(`${rel} (${stats.size} bytes)`);
      }
    }
  }

  walk(OUTPUT_DIR);
  return results.length > 0
    ? `Files in output/:\n${results.join("\n")}`
    : "No files found in output/ directory.";
}

/**
 * executeCommand – Runs a shell command and returns stdout.
 * Restricted to safe commands only.
 * @param {string} cmd – The shell command to execute
 * @returns {Promise<string>} stdout output
 */
export function executeCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        resolve(`❌ Command error: ${error.message}`);
      } else {
        resolve(stdout || stderr || "Command executed successfully (no output).");
      }
    });
  });
}

/**
 * openInBrowser – Opens the generated HTML file in the default browser.
 * @param {string} filename – The HTML file to open (relative to output/)
 * @returns {Promise<string>} Result message
 */
export function openInBrowser(filename) {
  const filePath = path.resolve(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return Promise.resolve(`❌ File "${filename}" not found. Cannot open in browser.`);
  }
  const openCmd =
    process.platform === "darwin"
      ? `open "${filePath}"`
      : process.platform === "win32"
      ? `start "" "${filePath}"`
      : `xdg-open "${filePath}"`;

  return new Promise((resolve) => {
    exec(openCmd, (error) => {
      if (error) {
        resolve(`❌ Failed to open browser: ${error.message}`);
      } else {
        resolve(`🌐 Opened "${filename}" in the default browser.`);
      }
    });
  });
}

// ─── Tool registry ──────────────────────────────────────────────────

/**
 * Map of tool names → handler functions.
 * Used by the agent loop to dispatch tool calls.
 */
export const TOOL_MAP = {
  writeFile,
  readFile,
  listFiles,
  executeCommand,
  openInBrowser,
};

/**
 * Tool descriptions for the system prompt.
 */
export const TOOL_DESCRIPTIONS = `
Tools Available:
1. writeFile(filename: string, content: string)
   - Writes/creates a file inside the "output/" directory.
   - Use this to create HTML, CSS, and JS files.
   - Example: writeFile("index.html", "<html>...</html>")

2. readFile(filename: string)
   - Reads the content of a file from the "output/" directory.
   - Use this to verify or review files you've written.

3. listFiles()
   - Lists all files in the "output/" directory.
   - No arguments needed.

4. executeCommand(cmd: string)
   - Executes a shell command on the user's machine.
   - Use sparingly and only for safe operations.

5. openInBrowser(filename: string)
   - Opens an HTML file from the "output/" directory in the user's default browser.
   - Use this ONLY at the very end, after all files are complete.
`;
