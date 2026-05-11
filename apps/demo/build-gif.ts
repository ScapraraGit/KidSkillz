import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const FRAME_DIR = path.resolve("frames");
const OUT = path.resolve("..", "web", "public", "demo.gif");
const FPS = 12;
const WIDTH = 800;
const QUALITY = 80;

async function main() {
  const files = (await readdir(FRAME_DIR))
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => path.join(FRAME_DIR, f));

  if (files.length === 0) throw new Error(`No frames in ${FRAME_DIR}. Run \`pnpm record\` first.`);

  console.log(`Encoding ${files.length} frames → ${OUT}`);

  const args = [
    "--fps", String(FPS),
    "--width", String(WIDTH),
    "--quality", String(QUALITY),
    "--output", OUT,
    ...files,
  ];

  const code = await new Promise<number>((resolve, reject) => {
    const proc = spawn("gifski", args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (c) => resolve(c ?? 1));
  });

  if (code !== 0) throw new Error(`gifski exited ${code}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
