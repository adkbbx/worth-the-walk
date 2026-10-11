// Shared across requests and app instances. Queue upstream calls rather than requests.
// High-priority calls (merges) skip ahead of waiting tile reads, so a flyer's card appears
// as soon as its pages are read instead of after every other page.
export function createCallQueue(limit) {
  let active = 0;
  const high = [], normal = [];
  return async function queued(call, { priority = 'normal' } = {}) {
    await new Promise(resolve => {
      if (active < limit) { active++; resolve(); }
      else (priority === 'high' ? high : normal).push(resolve);
    });
    try { return await call(); }
    finally {
      const next = high.shift() ?? normal.shift();
      if (next) next();
      else active--;
    }
  };
}

// DigitalOcean serverless inference handled 10 parallel tile reads comfortably; a page is 6 tiles.
export const modelCall = createCallQueue(10);

// Serverless latency has a long tail: the same tile took 15.6 s, 64 s and 110 s in one test.
// If the first request has not answered after `after` ms, send a duplicate and keep whichever
// finishes first; the other is aborted. Each attempt is capped at `limit` ms.
export async function hedged(run, { after = 25_000, limit = 90_000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const controllers = [];
  const attempt = () => {
    const controller = new AbortController();
    controllers.push(controller);
    return run(AbortSignal.any([controller.signal, AbortSignal.timeout(limit)]));
  };
  let timer;
  const backup = new Promise((resolve, reject) => { timer = setTimer(() => attempt().then(resolve, reject), after); });
  try { return await Promise.any([attempt(), backup]); }
  catch (error) { throw error.errors?.[0] ?? error; }
  finally { clearTimer(timer); for (const controller of controllers) controller.abort(); }
}
