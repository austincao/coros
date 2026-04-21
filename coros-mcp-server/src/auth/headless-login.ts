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
    const userField = page.locator('input[placeholder*="手机号"], input[placeholder*="邮箱"], input[placeholder*="Email"], input[type="text"]').first();
    await userField.fill(user);
    await page.waitForTimeout(500);
    const passField = page.locator('input[type="password"]').first();
    await passField.fill(pass);
    await page.waitForTimeout(500);
    
    // Check privacy policy
    console.log("Looking for privacy policy checkbox...");
    const privacyArea = page.locator('span:has-text("我已阅读并同意"), .ant-checkbox-wrapper').last();
    if (await privacyArea.isVisible()) {
      console.log("Checking privacy policy via click...");
      await privacyArea.click({ force: true });
      await page.waitForTimeout(500);
    }
    
    console.log("Submitting login form...");
    const loginButton = page.locator('.ant-btn-primary:has-text("登录"), .ant-btn-primary:has-text("Login"), button[type="submit"]').first();
    await loginButton.click();

    // Wait for navigation or cookie
    console.log("Waiting for authentication (timeout: 45s)...");
    
    let tokenValue: string | null = null;
    const deadline = Date.now() + 45000;
    let lastUrl = "";
    
    while (Date.now() < deadline) {
      const currentUrl = page.url();
      if (currentUrl !== lastUrl) {
        console.log(`Current URL: ${currentUrl}`);
        lastUrl = currentUrl;
      }

      const cookies = await context.cookies([
        "https://t.coros.com",
        "https://www.coros.com",
        "https://teamcnapi.coros.com",
      ]);
      const tokenCookie = cookies.find((c) => c.name === cookieName);
      if (tokenCookie?.value) {
        console.log("Token found in cookies!");
        tokenValue = tokenCookie.value;
        break;
      }
      
      // Check for visible error messages
      const errorMsg = page.locator(".ant-message-notice-content, .error-message, .message-error");
      if (await errorMsg.isVisible()) {
        const text = await errorMsg.innerText();
        throw new Error(`Login failed with error on page: ${text}`);
      }
      
      // Check for CAPTCHA
      const captcha = page.locator(".nc_wrapper, #nc_1_wrapper, .geetest_holder");
      if (await captcha.isVisible()) {
        throw new Error("Login blocked by CAPTCHA. Headless login is not possible from this IP.");
      }
      
      await page.waitForTimeout(2000);
    }

    if (!tokenValue) {
      // Take a screenshot for debugging if running in a supported environment
      if (process.env.GITHUB_ACTIONS) {
        await page.screenshot({ path: "login-timeout-debug.png", fullPage: true });
        console.log("Screenshot saved to login-timeout-debug.png");
      }
      throw new Error(`Failed to get COROS token. Timed out. Final URL: ${page.url()}`);
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
