/* Data access for the hosted engines.
   GitHub Pages cannot call Bet9ja directly: the feeds send no Access-Control-Allow-Origin
   header for this origin. The page therefore sends every API request through the tiny
   relay in /proxy/worker.js (a free Cloudflare Worker). The relay URL is configured once
   and kept in localStorage. */
const EngineNet = (() => {
  const KEY = 'engineProxyUrl';
  let proxy = '';
  try { proxy = localStorage.getItem(KEY) || ''; } catch (e) { }
  const listeners = new Set();

  function normalize(input) {
    let u = String(input || '').trim();
    if (!u) return '';
    // Allow pasting the whole worker URL, the worker URL with ?url=, or a {url} template.
    if (u.includes('{url}')) return u;
    if (/[?&]url=$/.test(u)) return u;
    return u.replace(/[?&]$/, '') + (u.includes('?') ? '&url=' : '?url=');
  }

  function setProxy(input) {
    proxy = normalize(input);
    try { localStorage.setItem(KEY, proxy); } catch (e) { }
    for (const fn of listeners) { try { fn(proxy); } catch (e) { } }
    return proxy;
  }

  function hasProxy() { return !!proxy; }

  // The bare Worker URL, without the relay's ?url= suffix. Used to detect the
  // optional 24/7 collector API on the same Worker.
  function getBase() {
    let b = String(proxy || '').trim();
    if (!b) return '';
    if (b.includes('{url}')) b = b.split('{url}')[0];
    b = b.replace(/[?&]url=$/, '').replace(/[?&]$/, '');
    return b.replace(/\/+$/, '');
  }

  async function call(url, init = {}) {
    if (!proxy) {
      const err = new Error('No data relay configured');
      err.code = 'NO_PROXY';
      throw err;
    }
    const target = proxy.includes('{url}')
      ? proxy.replace('{url}', encodeURIComponent(url))
      : proxy + encodeURIComponent(url);
    const r = await fetch(target, {
      method: init.method || 'GET',
      headers: init.headers,
      body: init.body,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow'
    });
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); }
    catch (e) {
      const err = new Error(`The relay returned ${r.status} ${r.statusText || ''} instead of JSON. Check the relay URL.`);
      err.code = 'BAD_RELAY';
      err.text = text.slice(0, 200);
      throw err;
    }
    // API-level errors are returned as JSON and handled by the callers; only relay
    // failures (missing url, blocked host, network error) reach this point.
    if (j && j.relayError) { const err = new Error(j.relayError); err.code = 'RELAY'; throw err; }
    return j;
  }

  return { call, hasProxy, setProxy, getProxy: () => proxy, getBase, onChange: fn => listeners.add(fn) };
})();
