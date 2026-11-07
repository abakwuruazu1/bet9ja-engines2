// League Plus feed: API client + the exact parsing used by the browser engine.
// The API only returns the upcoming round and the last finished round, so the
// collector polls it every minute and stores each finished round permanently.

export const LP_API = 'https://stadium-tv-api.bet9ja.com';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function lpFetch(path) {
  const r = await fetch(LP_API + path, {
    headers: {
      'user-agent': UA,
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'origin': 'https://www.bet9ja.com',
      'referer': 'https://www.bet9ja.com/'
    },
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
  const j = await r.json();
  if (!j || j.status !== 1) throw new Error((j && j.error && j.error.message) || 'API error');
  return j.data;
}

export const LPParse = (() => {
  function hashSel(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return 'sel:' + s.length + ':' + (x >>> 0).toString(36); }

  // finished round -> { matches, selsets }
  function results(game, rr) {
    const out = [], selsets = {};
    (rr.competitions || []).forEach((comp, ci) => {
      const names = String(rr.matches[ci] || '').split('|').filter(Boolean);
      const scores = String(rr.results[ci] || '').split('|');
      const odds = String(rr.odds[ci] || '').split('|');
      const sel = String(rr.selections[ci] || ''); const sk = hashSel(sel); selsets[sk] = sel;
      const goals = names.map(() => []);
      String((rr.timeline || [])[ci] || '').split('|').filter(Boolean).forEach(ev => {
        const [min, codes] = ev.split(':'); String(codes || '').split('-').forEach(cs => { const c = +cs; if (!c) return; const idx = Math.floor((c - 1) / 2); if (goals[idx]) goals[idx].push([+min, c % 2 === 1 ? 'h' : 'a']); });
      });
      names.forEach((nm, i) => {
        const [home, away] = nm.split('-'); const [hg, ag] = String(scores[i] || '').split(':').map(Number);
        if (!(hg >= 0) || !(ag >= 0)) return;
        const g = goals[i].sort((x, y) => x[0] - y[0]);
        out.push({ key: rr.roundId + ':' + comp + ':' + i, game, comp, roundId: +rr.roundId, season: +rr.seasons[ci], week: +rr.weeks[ci], ts: Date.parse(rr.liveStartDate), idx: i, home, away, hg, ag, goals: g, tlOk: g.length === hg + ag, odds: odds[i] || '', sk });
      });
    });
    return { matches: out, selsets };
  }

  // upcoming round -> { fixtures, selsets }
  function upcoming(game, r) {
    const out = [], selsets = {};
    (r.competitions || []).forEach((comp, ci) => {
      const names = String(r.matches[ci] || '').split('|').filter(Boolean), odds = String(r.odds[ci] || '').split('|');
      const sel = String(r.selections[ci] || ''); const sk = hashSel(sel); selsets[sk] = sel;
      names.forEach((nm, i) => { const [home, away] = nm.split('-'); out.push({ key: r.roundId + ':' + comp + ':' + i, game, comp, roundId: +r.roundId, season: +r.seasons[ci], week: +r.weeks[ci], ts: Date.parse(r.startDate), close: Date.parse(r.noBetDate || r.endDate), end: Date.parse(r.endDate), idx: i, home, away, odds: odds[i] || '', sk }); });
    });
    return { fixtures: out, selsets };
  }

  function oddsMap(oddsStr, selStr) { const ids = String(selStr).split('-'), o = String(oddsStr).split('-').map(Number), m = new Map(); ids.forEach((id, i) => { if (o[i] > 1) m.set(+id, o[i]); }); return m; }

  return { results, upcoming, oddsMap, hashSel };
})();
