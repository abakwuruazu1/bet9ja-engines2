import { CORS, json } from './http.js';

const ALLOWED_HOSTS = new Set([
  'zoomapi.bet9ja.com',
  'stadium-tv-api.bet9ja.com',
  'tennis-api.ng.zoomvirtualsports.com',
  'www.zoomscores.ng',
  'zoomscores.ng'
]);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FORWARD = ['clientid', 'content-type', 'accept', 'accept-language', 'authorization'];

export async function handleRelay(request) {
  const u = new URL(request.url);
  const target = u.searchParams.get('url');
  if (!target) return json({ relayError: 'Missing ?url= parameter' }, 400);

  let t;
  try { t = new URL(target); } catch (e) { return json({ relayError: 'Invalid target URL' }, 400); }
  if (t.protocol !== 'https:' || !ALLOWED_HOSTS.has(t.hostname)) {
    return json({ relayError: 'Host not allowed: ' + t.hostname }, 403);
  }

  const headers = new Headers();
  for (const h of FORWARD) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('User-Agent', UA);
  headers.set('Accept', headers.get('Accept') || 'application/json, text/plain, */*');
  headers.set('Accept-Language', headers.get('Accept-Language') || 'en-US,en;q=0.9');
  headers.set('Origin', 'https://www.zoomscores.ng');
  headers.set('Referer', 'https://www.zoomscores.ng/');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Sec-CH-UA', '"Chromium";v="131", "Not_A Brand";v="24"');
  headers.set('Sec-CH-UA-Mobile', '?0');
  headers.set('Sec-CH-UA-Platform', '"Windows"');
  headers.set('Sec-Fetch-Dest', 'empty');
  headers.set('Sec-Fetch-Mode', 'cors');
  headers.set('Sec-Fetch-Site', 'same-site');

  const method = request.method === 'HEAD' ? 'GET' : request.method;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  try {
    const r = await fetch(t.toString(), { method, headers, body, redirect: 'follow' });
    const out = new Headers(CORS);
    out.set('Content-Type', r.headers.get('Content-Type') || 'application/json');
    out.set('Cache-Control', 'no-store');
    return new Response(r.body, { status: r.status, headers: out });
  } catch (e) {
    return json({ relayError: 'Upstream fetch failed: ' + e.message }, 502);
  }
}
