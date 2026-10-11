// Shared across requests and app instances. Queue upstream calls rather than requests.
export function createCallQueue(limit) {
  let active = 0;
  const waiting = [];
  return async function queued(call) {
    await new Promise(resolve => {
      if (active < limit) { active++; resolve(); }
      else waiting.push(resolve);
    });
    try { return await call(); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

export const modelCall = createCallQueue(6);
