import { createTabPFN } from '../agent/tabpfn.mjs';
import { loadEnv } from '../agent/env.mjs';
loadEnv();
const train = Array.from({ length: 12 }, (_, index) => {
  const label = Number(index >= 6);
  return { row: [0, label ? 0.2 + (index - 6) * 0.1 : 5 + index, 0, label, 0, 10, 0, 0, 1], label };
});
const predict = [{ id: 'near-trial', row: [0, 0.3, 0, 1, 0, 10, 0, 0, 1] },
  { id: 'far-no-trial', row: [0, 8, 0, 0, 0, 10, 0, 0, 1] },
  { id: 'near-trial-2', row: [0, 0.6, 0, 1, 0, 10, 0, 0, 1] }];
const start = performance.now();
const result = await createTabPFN().rank({ train, predict });
console.log(JSON.stringify({ ...result, elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(2)) }, null, 2));
if (result.model !== 'tabpfn') process.exitCode = 1;
