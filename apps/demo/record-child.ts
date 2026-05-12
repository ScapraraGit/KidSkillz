import { chromium, Page } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const FRAME_DIR = path.resolve("frames-child");
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
  // Scene 1: login page → Kid tab
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await sleep(1200);
  await page.getByRole("button", { name: /^kid$/i }).click();
  await sleep(900);

  // Scene 2: family lookup
  const familyInput = page.locator('input[placeholder="Family name"]');
  await familyInput.fill("");
  await sleep(200);
  await familyInput.fill("Caprara");
  await sleep(600);
  await page.getByRole("button", { name: /^find$/i }).click();
  await sleep(1500);

  // Pick family if multiple shown (single = auto-pick)
  const familyBtn = page.locator("button.w-full.text-left").first();
  if (await familyBtn.isVisible().catch(() => false)) {
    await familyBtn.click();
    await sleep(800);
  }

  // Scene 3: pick child Ava
  await sleep(1500);
  await page.getByRole("button", { name: /ava/i }).click();
  await sleep(1500);

  // Scene 4: enter PIN
  const pin = page.locator('input[inputmode="numeric"]');
  for (const d of "1234") {
    await pin.type(d, { delay: 0 });
    await sleep(220);
  }
  await sleep(700);
  await page.getByRole("button", { name: /let's go/i }).click();

  // Scene 5: child dashboard
  await page.waitForURL(/\/me$/, { timeout: 10000 });
  await sleep(3500);

  // Scene 6: rewards
  await page.getByRole("link", { name: /^rewards$/i }).click();
  await sleep(3500);

  // Scene 7: initiative
  await page.getByRole("link", { name: /initiative/i }).click();
  await sleep(2500);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
