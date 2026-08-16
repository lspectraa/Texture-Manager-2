import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function writePng(path, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 4;
      raw[i] = (x * 12) & 255;
      raw[i + 1] = (y * 12) & 255;
      raw[i + 2] = 200;
      raw[i + 3] = 255;
    }
  }
  const compressed = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

const root = new URL("..", import.meta.url);
const bin = fileURLToPath(
  new URL(
    "./src-tauri/binaries/waifu2x-ncnn-vulkan-x86_64-pc-windows-msvc.exe",
    root,
  ),
);
const models = fileURLToPath(
  new URL("./src-tauri/resources/upscaler/models-cunet/", root),
);
const binariesDir = fileURLToPath(new URL("./src-tauri/binaries/", root));
const work = join(tmpdir(), "tm2-upscale-smoke");
mkdirSync(work, { recursive: true });
const input = join(work, "in.png");
const output = join(work, "out.png");
writePng(input, 16, 16);

console.log("Running sidecar…");
try {
  execFileSync(
    bin,
    ["-i", input, "-o", output, "-n", "-1", "-s", "2", "-m", models],
    { stdio: "inherit", cwd: binariesDir },
  );
} catch (err) {
  console.error("sidecar failed", err.message);
  process.exit(1);
}

if (!existsSync(output)) {
  console.error("missing output");
  process.exit(1);
}
console.log("ok bytes", statSync(output).size);
