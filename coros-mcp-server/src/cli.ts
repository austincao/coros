#!/usr/bin/env node
import process from "node:process";
import { EnvSessionProvider } from "./auth/session.js";
import { runBrowserLogin } from "./auth/browser-login.js";
import { startServer } from "./server.js";

function printHelp() {
  console.log(`coros-mcp-server

Usage:
  coros-mcp-server serve
  coros-mcp-server auth login
  coros-mcp-server auth status
  coros-mcp-server auth clear

Notes:
  - Running without arguments defaults to 'serve'
  - Auth commands use COROS_SESSION_PATH when provided
`);
}

async function printResult(result: unknown, exitOnError = false) {
  console.log(JSON.stringify(result, null, 2));
  if (exitOnError && typeof result === "object" && result && "ok" in result && (result as { ok?: boolean }).ok === false) {
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const [command, subcommand] = args;

  if (!command || command === "serve") {
    await startServer();
    return;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return;
  }

  if (command !== "auth") {
    printHelp();
    process.exit(1);
  }

  const provider = new EnvSessionProvider("https://teamcnapi.coros.com");

  switch (subcommand) {
    case "login":
      await runBrowserLogin();
      return;
    case "status":
      await printResult(await provider.getAuthStatus(), true);
      return;
    case "clear":
      await printResult(await provider.clearSession(), true);
      return;
    default:
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
