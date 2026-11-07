// Local stand-in for the Cloudflare Worker, for development and for people who prefer
// to run the relay on their own machine. It executes the exact same worker.js.
//   node scripts/proxy-local.mjs [port]
import http from 'node:http';
import { Readable } from 'node:stream';
import worker from '../proxy/worker.js';

const port = +(process.argv[2] || 8787);
const host = '127.0.0.1';

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET');
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined
    });
    const response = await worker.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ relayError: e.message }));
  }
});

server.listen(port, host, () => {
  console.log(`Bet9ja local relay listening on http://${host}:${port}`);
  console.log(`Use this URL in the site:  http://${host}:${port}`);
});
