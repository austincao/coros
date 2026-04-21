import { chromium } from "playwright-core";
import { EnvSessionProvider } from "./session.js";

const DEFAULT_LOGIN_URL = "https://t.coros.com/login?lastUrl=%2Fadmin%2Fviews%2Fdash-board";
const DEFAULT_COOKIE_NAME = "CPL-coros-token";

async function detectChromeExecutable() {
  const explicit = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (explicit) {
    return explicit;
  }
  // Simplified for GitHub Actions (usually has 'google-chrome' or 'chromium' in path)
  return "google-chrome"; 
}

export async function runHeadlessLogin(account?: string, password?: string) {
  const user = account || process.env.COROS_ACCOUNT;
  const pass = password || process.env.COROS_PASSWORD;

  if (!user || !pass) {
    throw new Error("COROS_ACCOUNT and COROS_PASSWORD are required for headless login");
  }

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });

  const sessionProvider = new EnvSessionProvider("https://teamcnapi.coros.com");
  const cookieName = process.env.COROS_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME;

  try {
    const page = await context.newPage();
    console.log(`Navigating to ${DEFAULT_LOGIN_URL}...`);
    await page.goto(DEFAULT_LOGIN_URL, { waitUntil: "networkidle" });

    // Wait for the login form. 
    // Based on common COROS login page structure:
    // User name input usually has placeholder or type email/text
    // Password input has type password
    
    console.log("Filling login form...");
    await page.fill('input[type="text"], input[placeholder*="账号"], input[placeholder*="Email"]', user);
    await page.fill('input[type="password"]', pass);
    
    // Check if there is a "Keep me logged in" checkbox and check it if needed
    
    console.log("Submitting...");
    // Find the login button - usually a button with "登录" or "Login" text, or type submit
    const loginButton = page.locator('button:has-text("登录"), button:has-text("Login"), button[type="submit"]');
    await loginButton.click();

    // Wait for navigation or cookie
    console.log("Waiting for authentication...");
    
    let tokenValue: string | null = null;
    const deadline = Date.now() + 30000; // 30 seconds timeout
    
    while (Date.now() < deadline) {
      const cookies = await context.cookies([
        "https://t.coros.com",
        "https://www.coros.com",
        "https://teamcnapi.coros.com",
      ]);
      const tokenCookie = cookies.find((c) => c.name === cookieName);
      if (tokenCookie?.value) {
        tokenValue = tokenCookie.value;
        break;
      }
      await page.waitForTimeout(1000);
    }

    if (!tokenValue) {
      // Check if there is an error message on the page
      const errorText = await page.innerText('.error-message, .message-error').catch(() => null);
      throw new Error(`Failed to get COROS token. ${errorText ? `Page says: ${errorText}` : "Timed out."}`);
    }

    console.log("Importing session...");
    const imported = await sessionProvider.setAccessToken(tokenValue, true);
    if (!imported.ok) {
      throw new Error(imported.error.message);
    }

    console.log("Login successful!");
    return imported.data;
  } finally {
    await browser.close();
  }
}
