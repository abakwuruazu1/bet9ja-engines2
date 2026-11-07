import { collectLP } from './collect.js';
import { handleRelay } from './relay.js';
import { json, preflight } from './http.js';

const SERVICE = 'bet9ja-collector';
const VERSION = 1;

async function status(env) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM lp_rounds').first();
  const last = await env.DB.prepare('SELECT round_id, game, ts FROM lp_rounds ORDER BY ts DESC, round_id DESC LIMIT 1').first();
  const row = await env.DB.prepare("SELECT value FROM lp_state WHERE key = 'meta:last'").first();
  let meta = null;
  try { meta = row ? JSON.parse(row.value) : null; } catch (e) { }
  return json({
    ok: true,
    service: SERVICE,
    version: VERSION,
    rounds: count ? count.n : 0,
    lastRound: last || null,
    updatedAt: meta ? meta.at : null,
    lastError: meta ? meta.error : null,
    time: Date.now()
  });
}

async function stateRows(env) {
  const rows = await env.DB.prepare(
    "SELECT key, value FROM lp_state WHERE key = 'init' OR key LIKE 'up:%' OR key LIKE 'st:%'"
  ).all();
  const out = { init: null, upcoming: [], standings: [] };
  for (const r of rows.results || []) {
    let v;
    try { v = JSON.parse(r.value); } catch (e) { continue; }
    if (r.key === 'init') out.init = v;
    else if (r.key.startsWith('up:')) out.upcoming.push(v);
    else if (r.key.startsWith('st:')) out.standings.push(v);
  }
  out.upcoming.sort((a, b) => a.game - b.game);
  out.standings.sort((a, b) => a.game - b.game);
  return out;
}

async function snapshot(env, url) {
  const since = Math.max(0, +(url.searchParams.get('since') || 0));
  const limit = Math.min(1000, Math.max(1, +(url.searchParams.get('rounds') || 240)));

  let rows;
  if (since) {
    rows = await env.DB.prepare(
      'SELECT round_id, game, ts, json FROM lp_rounds WHERE ts > ? ORDER BY ts ASC, round_id ASC LIMIT ?'
    ).bind(since, limit).all();
  } else {
    rows = await env.DB.prepare(
      'SELECT round_id, game, ts, json FROM lp_rounds ORDER BY ts DESC, round_id DESC LIMIT ?'
    ).bind(limit).all();
  }

  let list = rows.results || [];
  if (!since) list = list.slice().reverse();

  const rounds = [];
  for (const r of list) {
    try {
      const v = JSON.parse(r.json);
      rounds.push({ roundId: r.round_id, game: r.game, ts: r.ts, matches: v.matches || [], selsets: v.selsets || {} });
    } catch (e) { /* skip corrupt row */ }
  }

  const state = await stateRows(env);
  const lastTs = rounds.length ? rounds[rounds.length - 1].ts : since;
  return json({
    ok: true,
    service: SERVICE,
    version: VERSION,
    generatedAt: Date.now(),
    since,
    lastTs,
    hasMore: list.length === limit,
    init: state.init,
    rounds,
    upcoming: state.upcoming,
    standings: state.standings
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return preflight();

      if (url.pathname === '/api/health') {
        return json({ ok: true, service: SERVICE, version: VERSION, time: Date.now() });
      }
      if (url.pathname === '/api/lp/status') return await status(env);
      if (url.pathname === '/api/lp') return await snapshot(env, url);
      if (url.pathname === '/api/lp/state') {
        const state = await stateRows(env);
        return json({ ok: true, service: SERVICE, version: VERSION, generatedAt: Date.now(), ...state });
      }
      if (url.searchParams.get('url')) return await handleRelay(request);

      return json({
        ok: true,
        service: SERVICE,
        version: VERSION,
        message: 'Bet9ja League Plus 24/7 collector',
        endpoints: ['/api/lp/status', '/api/lp?rounds=240', '/api/lp?since=<ts>', '/api/lp/state', '/api/health', '/?url=<bet9ja-api-url> (relay)']
      });
    } catch (e) {
      return json({ ok: false, service: SERVICE, error: e.message }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(collectLP(env));
  }
};
