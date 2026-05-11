import { chromium, Page } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const FRAME_DIR = path.resolve("frames");
const FPS = 12;
const FRAME_MS = Math.round(1000 / FPS);
const MAX_SECONDS = 20;
const MAX_FRAMES = FPS * MAX_SECONDS;

const VIEW = { width: 1024, height: 640 };

async function main() {
  await rm(FRAME_DIR, { recursive: true, force: true });
  await mkdir(FRAME_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  let frame = 0;
  let recording = true;
  const capture = async () => {
    while (recording && frame < MAX_FRAMES) {
      const start = Date.now();
      const idx = String(frame).padStart(4, "0");
      try {
        await page.screenshot({ path: path.join(FRAME_DIR, `${idx}.png`), type: "png" });
      } catch {
        // page closing — stop
        break;
      }
      frame++;
      const elapsed = Date.now() - start;
      if (elapsed < FRAME_MS) await sleep(FRAME_MS - elapsed);
    }
  };
  const capturePromise = capture();

  try {
    await runScript(page);
  } finally {
    recording = false;
    await capturePromise;
    await browser.close();
  }

  console.log(`Captured ${frame} frames at ${FPS}fps → ${(frame / FPS).toFixed(1)}s`);
}

async function runScript(page: Page) {
  // Scene 1: login page
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await sleep(1500);
  await page.locator('input[type="email"]').fill("dad@example.com");
  await sleep(500);
  await page.locator('input[type="password"]').fill("password123");
  await sleep(700);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Scene 4: parent dashboard
  await page.waitForURL(/\/parent$/, { timeout: 10000 });
  await sleep(2500);

  // Dismiss tour overlay if it appears
  const skip = page.getByRole("button", { name: /skip tour/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await sleep(600);
  }

  // Scene 5: tasks page
  await page.getByRole("link", { name: /^tasks$/i }).click();
  await sleep(2800);

  // Scene 6: approvals page
  await page.getByRole("link", { name: /approvals/i }).click();
  await sleep(2800);

  // Scene 7: rewards page
  await page.getByRole("link", { name: /^rewards$/i }).click();
  await sleep(2500);

  // Scene 8: kids page
  await page.getByRole("link", { name: /^kids$/i }).click();
  await sleep(2500);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
