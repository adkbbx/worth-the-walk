import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { noopLogger } from '@mastra/core/logger';
import { loadEnv } from '../agent/env.mjs';
import { modelInfo, visionModel } from '../agent/models.mjs';

const prompt = 'This is one section of a Japanese flyer. List every product with its large red member cash price (会員現金払) and the non-member price (非会員・カード払価格). Return JSON {"items":[{"name_ja":"...","name_en":"...","member_cash_yen":123,"nonmember_yen":123}]}. Only report text you can actually read.';
const started = performance.now();

function safeText(value) {
  let text = String(value);
  for (const key of [process.env.GRADIENT_MODEL_ACCESS_KEY, process.env.DIGITALOCEAN_INFERENCE_KEY]) {
    if (key) text = text.split(key).join('[REDACTED]');
  }
  return text;
}

try {
  loadEnv();
  const imagePath = process.argv[2];
  if (!imagePath) throw new Error('Usage: node scripts/spike-read-tile.mjs <imagePath>');
  const mediaType = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(imagePath).toLowerCase()];
  if (!mediaType) throw new Error('Use a PNG, JPEG, or WebP image');
  const image = new Uint8Array(await readFile(imagePath));
  const agent = new Agent({
    id: 'flyer-reader',
    name: 'flyer-reader',
    instructions: 'Read only text that is printed. Return JSON only.',
    model: visionModel(),
  });
  const mastra = new Mastra({ agents: { flyerReader: agent }, logger: noopLogger });
  console.log(safeText(JSON.stringify(modelInfo())));
  const result = await mastra.getAgent('flyerReader').generate([{
    role: 'user',
    content: [{ type: 'text', text: prompt }, { type: 'image', image, mediaType }],
  }]);
  if (result.error) throw result.error;
  if (!result.text?.trim()) throw new Error('Model returned no text');
  console.log(`Elapsed: ${((performance.now() - started) / 1000).toFixed(2)} seconds`);
  console.log(safeText(result.text));
} catch (error) {
  console.error(`Elapsed: ${((performance.now() - started) / 1000).toFixed(2)} seconds`);
  console.error(safeText(error instanceof Error ? error.message : error));
  process.exitCode = 1;
}
