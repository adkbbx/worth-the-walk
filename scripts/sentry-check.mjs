import { readFile } from 'node:fs/promises';
import { inflateSync, deflateSync } from 'node:zlib';
import { createApp } from '../agent/mastra.mjs';
import { loadEnv } from '../agent/env.mjs';
loadEnv();
// The source fixture exceeds the HTTP tile cap after base64 encoding. Resize
// its 8-bit RGBA PNG in memory; neither images nor extracted text are saved.
function tilePNG(source) {
  if (source.length * 4 / 3 < 2 * 1024 * 1024) return source;
  const header = source.subarray(16, 29);
  if (header[8] !== 8 || header[9] !== 6 || header[12] !== 0) throw new Error('Unsupported fixture PNG');
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), parts = [];
  for (let at = 8; at < source.length;) {
    const size = source.readUInt32BE(at);
    if (source.toString('ascii', at + 4, at + 8) === 'IDAT') parts.push(source.subarray(at + 8, at + 8 + size));
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(parts)), pixels = Buffer.alloc(width * height * 4);
  const stride = width * 4;
  function paeth(a, b, c) {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, a = x >= 4 ? pixels[index - 4] : 0,
        b = y ? pixels[index - stride] : 0, c = y && x >= 4 ? pixels[index - stride - 4] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[index] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  const w = Math.min(width, 960), h = Math.round(height * w / width), rows = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    rows[y * (w * 3 + 1)] = 1; // PNG sub filter
    let previous = [0, 0, 0];
    for (let x = 0; x < w; x++) {
      const offset = (Math.floor(y * height / h) * width + Math.floor(x * width / w)) * 4;
      const rgb = [0, 1, 2].map(channel => Math.round(pixels[offset + channel] * pixels[offset + 3] / 255 + 255 - pixels[offset + 3]));
      for (let c = 0; c < 3; c++) rows[y * (w * 3 + 1) + 1 + x * 3 + c] = (rgb[c] - previous[c]) & 255;
      previous = rgb;
    }
  }
  function chunk(type, data) {
    const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8);
    let crc = 0xffffffff;
    for (const byte of out.subarray(4, data.length + 8)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4); return out;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([source.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
if (!process.env.SENTRY_DSN || !(process.env.GRADIENT_MODEL_ACCESS_KEY || process.env.DIGITALOCEAN_INFERENCE_KEY)) {
  console.error('SENTRY_DSN and a DigitalOcean inference key are required.'); process.exitCode = 1;
} else {
  const app = createApp({ env: { ...process.env, MOCK_GEMMA: '0', LOCAL_LLM: '0' } });
  const observability = app.mastra.observability;
  const exporter = observability.getDefaultInstance().getExporters()[0];
  const originalExport = exporter.exportTracingEvent.bind(exporter);
  let traceId;
  exporter.exportTracingEvent = async event => {
    traceId ??= event.exportedSpan.traceId;
    return originalExport(event);
  };
  try {
    const image = tilePNG(await readFile(new URL('../.local-fixtures/meat.png', import.meta.url)));
    const result = await app.readPage({ pageId: 'sentry-check', tiles: [`data:image/png;base64,${image.toString('base64')}`] });
    await observability.flush();
    console.log(JSON.stringify({ traceId, tilesRead: result.tiles.filter(Boolean).length }));
    if (!traceId || !result.tiles[0]) process.exitCode = 1;
  } catch { console.error('Sentry live check failed (provider details withheld).'); process.exitCode = 1; }
  finally { await observability.flush(); await observability.shutdown(); }
}
