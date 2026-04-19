import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright-core";
import { EnvSessionProvider } from "./session.js";

const DEFAULT_LOGIN_URL = "https://t.coros.com/login?lastUrl=%2Fadmin%2Fviews%2Fdash-board";
const DEFAULT_COOKIE_NAME = "CPL-coros-token";

function browserProfileDir() {
  return (
    process.env.COROS_BROWSER_PROFILE_DIR?.trim() ||
    path.join(os.homedir(), ".config", "coros-mcp", "browser-profile")
  );
}

function timeoutMs() {
  const raw = process.env.COROS_BROWSER_LOGIN_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10 * 60 * 1000;
}

function buildCookieHeader(cookies: Array<{ name: string; value: string }>) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(command: string) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  if (result.status === 0) {
    const resolved = result.stdout.trim();
    return resolved || null;
  }
  return null;
}

async function detectChromeExecutable() {
  const explicit = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicit) {
    return explicit;
  }

  const platform = process.platform;
  const candidates =
    platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        ]
      : platform === "win32"
        ? [
            path.join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
            path.join(
              process.env["PROGRAMFILES(X86)"] ?? "",
              "Google",
              "Chrome",
              "Application",
              "chrome.exe",
            ),
            path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
          ]
        : [];

  for (const candidate of candidates) {
    if (candidate && (await pathExists(candidate))) {
      return candidate;
    }
  }

  for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const resolved = findOnPath(command);
    if (resolved) {
      return resolved;
    }
  }

  throw new Error(
    "Could not find a Chrome/Chromium executable. Set CHROME_EXECUTABLE_PATH explicitly.",
  );
}

async function waitForCorosCookie(
  page: { context(): { cookies(urls: string[]): Promise<Array<{ name: string; value: string }>> }; waitForTimeout(ms: number): Promise<void> },
  cookieName: string,
  deadlineMs: number,
) {
  while (Date.now() < deadlineMs) {
    const cookies = await page.context().cookies([
      "https://t.coros.com",
      "https://www.coros.com",
      "https://teamcnapi.coros.com",
    ]);

    const tokenCookie = cookies.find((cookie) => cookie.name === cookieName);
    if (tokenCookie?.value) {
      return {
        cookieHeader: buildCookieHeader(cookies),
      };
    }

    await page.waitForTimeout(1000);
  }

  return null;
}

export async function runBrowserLogin() {
  const executablePath = await detectChromeExecutable();
  const userDataDir = browserProfileDir();
  const sessionProvider = new EnvSessionProvider("https://teamcnapi.coros.com");
  const cookieName = process.env.COROS_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME;
  const deadline = Date.now() + timeoutMs();

  console.log(`Launching browser profile: ${userDataDir}`);
  console.log(
    `Session target: ${process.env.COROS_SESSION_PATH?.trim() || "~/.config/coros-mcp/session.json"}`,
  );
  console.log("Complete COROS login in the opened browser window. This helper will import the token automatically.");

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    viewport: { width: 1440, height: 960 },
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(DEFAULT_LOGIN_URL, { waitUntil: "domcontentloaded" });

    const result = await waitForCorosCookie(page, cookieName, deadline);
    if (!result) {
      throw new Error(`Timed out waiting for ${cookieName}. Finish login and retry.`);
    }

    const imported = await sessionProvider.importFromCookieHeader(result.cookieHeader, cookieName, true);
    if (!imported.ok) {
      throw new Error(imported.error.message);
    }

    console.log(
      JSON.stringify(
        {
          authenticated: imported.data.authenticated,
          token_source: imported.data.token_source,
          token_profile_path: imported.data.token_profile_path,
          cookie_name: imported.data.cookie_name,
          user_id: imported.data.user_id,
          nickname: imported.data.nickname,
          region: imported.data.region,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
}
