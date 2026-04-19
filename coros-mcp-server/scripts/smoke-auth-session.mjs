import { access, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function parseToolText(result) {
  const textItem = Array.isArray(result.content)
    ? result.content.find((item) => item.type === "text" && typeof item.text === "string")
    : undefined;

  if (!textItem) {
    return undefined;
  }

  try {
    return JSON.parse(textItem.text);
  } catch {
    return textItem.text;
  }
}

function getToolPayload(result) {
  return result.structuredContent ?? parseToolText(result);
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "coros-mcp-auth-"));
  const sessionPath = path.join(tempDir, "session.json");

  const client = new Client({
    name: "coros-mcp-auth-session-client",
    version: "0.1.0",
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      COROS_ACCESS_TOKEN: "",
      COROS_SESSION_PATH: sessionPath,
    },
    stderr: "pipe",
  });

  const stderr = transport.stderr;
  if (stderr) {
    stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }

  await client.connect(transport);

  try {
    const tools = await client.listTools();

    const statusBeforeResult = await client.callTool({
      name: "coros_auth_status",
      arguments: {},
    });
    const statusBefore = getToolPayload(statusBeforeResult);

    const setTokenResult = await client.callTool({
      name: "coros_auth_set_token",
      arguments: {
        access_token: "fake-token-from-set-tool",
        validate: false,
      },
    });
    const setToken = getToolPayload(setTokenResult);

    const persistedAfterSet = JSON.parse(await readFile(sessionPath, "utf8"));

    const importCookieResult = await client.callTool({
      name: "coros_auth_import_browser_cookie",
      arguments: {
        cookie_header: "foo=bar; CPL-coros-token=fake-token-from-cookie; theme=dark",
        validate: false,
      },
    });
    const importCookie = getToolPayload(importCookieResult);

    const persistedAfterImport = JSON.parse(await readFile(sessionPath, "utf8"));

    const clearResult = await client.callTool({
      name: "coros_auth_clear_session",
      arguments: {},
    });
    const clearPayload = getToolPayload(clearResult);

    let sessionExistsAfterClear = true;
    try {
      await access(sessionPath);
    } catch {
      sessionExistsAfterClear = false;
    }

    if (!tools.tools.some((tool) => tool.name === "coros_auth_import_browser_cookie")) {
      throw new Error(`Tool list is missing coros_auth_import_browser_cookie: ${JSON.stringify(tools.tools)}`);
    }
    if (statusBeforeResult.isError || statusBefore?.authenticated !== false) {
      throw new Error(`Unexpected initial auth status: ${JSON.stringify(statusBefore)}`);
    }
    if (setTokenResult.isError || setToken?.token_source !== "session_file") {
      throw new Error(`set_token failed: ${JSON.stringify(setToken)}`);
    }
    if (persistedAfterSet.access_token !== "fake-token-from-set-tool") {
      throw new Error(`session file was not written by set_token: ${JSON.stringify(persistedAfterSet)}`);
    }
    if (importCookieResult.isError || importCookie?.cookie_name !== "CPL-coros-token") {
      throw new Error(`import_browser_cookie failed: ${JSON.stringify(importCookie)}`);
    }
    if (persistedAfterImport.access_token !== "fake-token-from-cookie") {
      throw new Error(
        `session file was not overwritten by import_browser_cookie: ${JSON.stringify(
          persistedAfterImport,
        )}`,
      );
    }
    if (clearResult.isError || clearPayload?.cleared !== true || sessionExistsAfterClear) {
      throw new Error(`clear_session failed: ${JSON.stringify(clearPayload)}`);
    }

    console.log(
      JSON.stringify(
        {
          tool_count: tools.tools.length,
          status_before: statusBefore,
          set_token: setToken,
          import_browser_cookie: importCookie,
          clear_session: clearPayload,
          session_exists_after_clear: sessionExistsAfterClear,
        },
        null,
        2,
      ),
    );
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
