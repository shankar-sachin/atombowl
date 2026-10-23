// Daily SI credits. Each user has one doc, aiUsage/{uid} = { day: "YYYY-MM-DD", used: n },
// written only by the function (the rules deny client writes). The count resets at 00:00 UTC.

export function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function nextReset(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export function creditState(doc, limit, now = new Date()) {
  const used = doc?.day === dayKey(now) ? Math.max(0, Number(doc.used) || 0) : 0;
  return { limit, used, remaining: Math.max(0, limit - used), resetsAt: nextReset(now) };
}

// Returns the doc to write when the user can afford `cost`, or ok: false.
export function charge(doc, cost, limit, now = new Date()) {
  const state = creditState(doc, limit, now);
  if (cost > state.remaining) return { ok: false, state };
  const used = state.used + cost;
  return {
    ok: true,
    next: { day: dayKey(now), used },
    state: { ...state, used, remaining: limit - used }
  };
}

// Gives credits back after a failed model call. A refund never crosses a day boundary.
export function refund(doc, cost, now = new Date()) {
  if (doc?.day !== dayKey(now)) return null;
  return { day: doc.day, used: Math.max(0, (Number(doc.used) || 0) - cost) };
}
