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

async function main() {
  if (!process.env.COROS_ACCESS_TOKEN) {
    throw new Error("COROS_ACCESS_TOKEN is required");
  }

  const client = new Client({
    name: "coros-mcp-smoke-client",
    version: "0.1.0",
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      COROS_ACCESS_TOKEN: process.env.COROS_ACCESS_TOKEN,
    },
    stderr: "pipe",
  });

  const stderr = transport.stderr;
  if (stderr) {
    stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }

  client.onerror = (error) => {
    console.error("[mcp-client-error]", error);
  };

  await client.connect(transport);

  try {
    const tools = await client.listTools();
    const authStatus = await client.callTool({ name: "coros_auth_status", arguments: {} });
    const profile = await client.callTool({ name: "coros_get_profile", arguments: {} });

    console.log(
      JSON.stringify(
        {
          tool_count: tools.tools.length,
          tool_names: tools.tools.map((tool) => tool.name),
          auth_status: authStatus.structuredContent ?? parseToolText(authStatus),
          profile: profile.structuredContent ?? parseToolText(profile),
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
