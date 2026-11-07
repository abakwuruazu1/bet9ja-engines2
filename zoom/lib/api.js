// Bet9ja Zoom API client (the data feed behind zoomscores.ng).
// Hosted pages cannot call zoomapi.bet9ja.com directly (no CORS headers), so every
// request goes through the relay configured in shared/net.js.
const ZAPI = (() => {
  const BASE = 'https://zoomapi.bet9ja.com/zoomexternalapi';

  async function call(path, cid, { method = 'GET', body } = {}) {
    const url = BASE + path;
    const init = { method, headers: { 'Content-Type': 'application/json', clientId: String(cid) }, body: body ? JSON.stringify(body) : undefined };
    const j = await EngineNet.call(url, init);
    if (!j || j.status !== 1) throw new Error((j && j.error && j.error.message) || 'API error');
    return j.data;
  }

  return {
    init: cid => call('/Competition/Init', cid, { method: 'POST', body: { clientId: String(cid), isShop: 0 } }),
    results: (cid, comp, prev, offset) => call(`/SeasonResult/Results?clientId=${cid}&competitionId=${comp}&previous=${prev ? 1 : 0}&offset=${offset}&limit=20`, cid),
    standings: (cid, comp, prev) => call(`/SeasonResult/Statistics?clientId=${cid}&competitionId=${comp}&previous=${prev ? 1 : 0}`, cid),
    matchStats: (cid, matchId) => call(`/MatchStatistics/MatchStatistics?clientId=${cid}&matchId=${matchId}`, cid),
    nextRound: (cid, roundId) => call(`/Competition/RoundTimeOffset?clientId=${cid}&roundId=${roundId}`, cid)
  };
})();
