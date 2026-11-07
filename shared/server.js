/* Optional 24/7 League Plus collector (Cloudflare Worker + D1 + cron).
   The same Worker URL is used as the CORS relay, so if the configured relay is a
   collector it is detected automatically and the League Plus page switches from
   browser capture to server snapshots. Plain relays simply fail detection and the
   browser keeps doing the capture. */
const EngineServer = (() => {
  let base = '';
  let lastStatus = null;

  function baseOf(candidate) {
    let b = String(candidate || '').trim();
    if (!b) return '';
    if (b.includes('{url}')) b = b.split('{url}')[0];
    b = b.replace(/[?&]url=$/, '').replace(/[?&]$/, '');
    return b.replace(/\/+$/, '');
  }

  async function detect(candidate) {
    const b = baseOf(candidate);
    if (!b) return null;
    try {
      const r = await fetch(b + '/api/lp/status', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || j.service !== 'bet9ja-collector') return null;
      base = b;
      lastStatus = j;
      return j;
    } catch (e) {
      return null;
    }
  }

  async function lpSnapshot({ since = 0, rounds = 240 } = {}) {
    if (!base) throw new Error('Collector not detected');
    const q = since ? `?since=${encodeURIComponent(since)}&rounds=${rounds}` : `?rounds=${rounds}`;
    const r = await fetch(base + '/api/lp' + q, { cache: 'no-store', signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error('Collector HTTP ' + r.status);
    const j = await r.json();
    if (!j || !j.ok) throw new Error((j && j.error) || 'Collector error');
    return j;
  }

  return {
    detect,
    lpSnapshot,
    getBase: () => base,
    getStatus: () => lastStatus,
    isActive: () => !!base,
    baseOf
  };
})();
