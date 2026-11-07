export async function getState(env, key) {
  const row = await env.DB.prepare('SELECT value FROM lp_state WHERE key = ?').bind(key).first();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch (e) { return null; }
}

export async function putState(env, key, value) {
  await env.DB.prepare(
    'INSERT INTO lp_state (key, value, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).bind(key, JSON.stringify(value), Date.now()).run();
}
