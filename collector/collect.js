import { lpFetch, LPParse } from './lp.js';
import { getState, putState } from './db.js';

const INIT_TTL = 6 * 3600e3;
const UPCOMING_TTL = 120e3;
const STANDINGS_TTL = 10 * 60e3;
const PRUNE_TTL = 30 * 24 * 3600e3;
const LOCK_TTL = 110e3;

export async function collectLP(env) {
  const now = Date.now();
  const lock = await getState(env, 'lock');
  if (lock && lock.at && now - lock.at < LOCK_TTL) return { skipped: 'locked', at: now };

  await putState(env, 'lock', { at: now });
  const result = { at: now, added: 0, rounds: 0, error: null, totalRounds: 0, lastRound: null };

  try {
    let init = await getState(env, 'init');
    if (!init || !Array.isArray(init.games) || !init.games.length || now - (init.at || 0) > INIT_TTL) {
      const d = await lpFetch('/game/init');
      init = { games: d.games || [], markets: d.markets || [], roundSpecialMarkets: d.roundSpecialMarkets || [], at: now };
      await putState(env, 'init', init);
    }

    for (const g of init.games) {
      try {
        const d = await lpFetch('/game/' + g.id + '/round');

        // 1. the finished round (the only history this API ever exposes)
        if (d.roundResults && d.roundResults.roundId) {
          const rid = +d.roundResults.roundId;
          const seen = await env.DB.prepare('SELECT round_id FROM lp_rounds WHERE round_id = ? AND game = ?').bind(rid, g.id).first();
          if (!seen) {
            const parsed = LPParse.results(g.id, d.roundResults);
            if (parsed.matches.length) {
              const start = Math.min(...parsed.matches.map(m => (Number.isFinite(m.ts) && m.ts > 0 ? m.ts : Infinity)));
              const ts = Number.isFinite(start) ? start : now;
              await env.DB.prepare(
                'INSERT INTO lp_rounds (round_id, game, ts, json, created_at) VALUES (?, ?, ?, ?, ?) ' +
                'ON CONFLICT(round_id, game) DO NOTHING'
              ).bind(rid, g.id, ts, JSON.stringify(parsed), now).run();
              result.added += parsed.matches.length;
              result.rounds++;
            }
          }
        }

        // 2. the open round and its real Bet9ja odds
        if (d.round && d.round.roundId) {
          const prev = await getState(env, 'up:' + g.id);
          if (!prev || prev.roundId !== d.round.roundId || now - (prev.at || 0) > UPCOMING_TTL) {
            const up = LPParse.upcoming(g.id, d.round);
            await putState(env, 'up:' + g.id, { game: g.id, roundId: d.round.roundId, fixtures: up.fixtures, selsets: up.selsets, at: now });
          }
        }

        // 3. league tables (slow-changing)
        const st = await getState(env, 'st:' + g.id);
        if (!st || now - (st.at || 0) > STANDINGS_TTL) {
          const ids = (g.leagues || []).filter(l => l.enabled).map(l => l.id).join(',');
          const s = await lpFetch('/game/standings/' + g.id + '?competitionIds=' + ids);
          await putState(env, 'st:' + g.id, { game: g.id, standings: s.standings || [], at: now });
        }
      } catch (e) {
        result.error = (result.error ? result.error + '; ' : '') + (g.name || g.id) + ': ' + e.message;
      }
    }

    // 4. retention: 30 days of rounds is plenty for ratings and value/backtest work
    const prune = await getState(env, 'prune');
    if (!prune || now - (prune.at || 0) > 3600e3) {
      await env.DB.prepare('DELETE FROM lp_rounds WHERE ts < ?').bind(now - PRUNE_TTL).run();
      await putState(env, 'prune', { at: now });
    }

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM lp_rounds').first();
    const last = await env.DB.prepare('SELECT round_id, game, ts FROM lp_rounds ORDER BY ts DESC, round_id DESC LIMIT 1').first();
    result.totalRounds = count ? count.n : 0;
    result.lastRound = last || null;
    await putState(env, 'meta:last', result);
  } catch (e) {
    result.error = e.message;
    try { await putState(env, 'meta:last', result); } catch (err) { }
  } finally {
    try { await putState(env, 'lock', { at: 0 }); } catch (e) { }
  }
  return result;
}
