/* One-time data relay setup. The engines need a tiny server-side relay because the
   Bet9ja feeds do not allow cross-origin browser requests. The pill is invisible once
   a relay URL has been saved. */
(() => {
  const STYLE = `
  #relayPill{position:fixed;right:18px;bottom:18px;z-index:30;display:flex;align-items:center;gap:8px;
    background:#1c2330;color:#e6edf3;border:1px solid #2a3342;border-radius:999px;padding:9px 14px;
    font:600 14px/1 "Segoe UI",Roboto,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 24px #0008}
  #relayPill:hover{border-color:#1fd17a}
  #relayPill .dot{width:8px;height:8px;border-radius:50%;background:#f5b942}
  #relayPill.ok .dot{background:#1fd17a}
  #relayModal{position:fixed;inset:0;background:#000b;z-index:40;display:grid;place-items:center;padding:18px}
  #relayModal.hidden{display:none}
  #relayModal .box{background:#161b22;border:1px solid #2a3342;border-radius:14px;padding:24px;width:min(720px,96vw);
    max-height:90vh;overflow:auto;font:15px/1.55 "Segoe UI",Roboto,system-ui,sans-serif;color:#e6edf3}
  #relayModal h2{margin:0 0 6px;font-size:21px}
  #relayModal p{color:#b7c2d0}
  #relayModal ol{padding-left:22px;color:#d7dde5}
  #relayModal li{margin:7px 0}
  #relayModal code{background:#0d1117;border:1px solid #2a3342;border-radius:5px;padding:1px 5px;font-size:13px}
  #relayModal input{width:100%;background:#0d1117;border:1px solid #2a3342;border-radius:8px;padding:10px 12px;
    color:#e6edf3;font:14px/1.3 ui-monospace,Consolas,monospace;margin:8px 0}
  #relayModal .btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
  #relayModal button{border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;font-size:14px}
  #relayModal .primary{background:#1fd17a;color:#04120a}
  #relayModal .ghost{background:transparent;color:#e6edf3;border:1px solid #2a3342}
  #relayModal .msg{font-size:14px;margin-top:10px;min-height:20px}
  #relayModal .msg.bad{color:#f2545b} #relayModal .msg.good{color:#1fd17a}
  #relayModal .warn{background:#2a2417;border-left:3px solid #f5b942;padding:9px 12px;border-radius:6px;color:#e8d7a8;font-size:13px}
  @media(max-width:600px){#relayPill{right:10px;bottom:10px;font-size:12px;padding:7px 10px}}
  `;

  function install() {
    if (document.getElementById('relayPill')) return;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const pill = document.createElement('button');
    pill.id = 'relayPill';
    pill.className = EngineNet.hasProxy() ? 'ok' : '';
    pill.innerHTML = '<span class="dot"></span><span class="label"></span>';
    document.body.appendChild(pill);

    const modal = document.createElement('div');
    modal.id = 'relayModal';
    modal.className = 'hidden';
    modal.innerHTML = `
      <div class="box">
        <h2>Connect live capture</h2>
        <p>The starter data is bundled, so every tab already works. To capture new rounds while
        this page is open, the engines need a small relay: Bet9ja's feeds do not allow direct
        browser requests from GitHub Pages.</p>
        <ol>
          <li>Open <a href="../proxy/worker.js" target="_blank" style="color:#4ea1ff">proxy/worker.js</a> and copy it
              (or use the copy button below).</li>
          <li>Go to <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" style="color:#4ea1ff">Cloudflare → Workers &amp; Pages</a>,
              create a Worker (free plan), paste the code and deploy.</li>
          <li>Copy the Worker URL (looks like <code>https://name.your-name.workers.dev</code>) and paste it here.</li>
        </ol>
        <div class="warn">The relay only allows the Bet9ja hosts and stores nothing. You can also run the
        included <code>scripts/proxy-local.mjs</code> on your own PC and use
        <code>http://127.0.0.1:8787</code> as the relay URL.
        <br><br>If you deployed the <b>24/7 collector</b> Worker (<code>collector/worker.js</code>), paste its
        URL here too: the League Plus page detects it automatically and loads server-collected rounds,
        so no browser has to stay open for League Plus.</div>
        <input id="relayUrl" type="url" spellcheck="false" placeholder="https://your-worker.your-name.workers.dev">
        <div class="btns">
          <button class="primary" id="relaySave">Save &amp; start capturing</button>
          <button class="ghost" id="relayTest">Test relay</button>
          <button class="ghost" id="relayCopy">Copy worker code</button>
          <button class="ghost" id="relayClose">Close</button>
        </div>
        <div class="msg" id="relayMsg"></div>
      </div>`;
    document.body.appendChild(modal);

    const msg = modal.querySelector('#relayMsg');
    const input = modal.querySelector('#relayUrl');
    const label = document.querySelector('#relayPill .label');
    const display = u => String(u || '').replace(/[?&]url=$/, '');
    input.value = display(EngineNet.getProxy());
    label.textContent = EngineNet.hasProxy() ? 'Capture connected' : 'Connect live capture';
    pill.className = EngineNet.hasProxy() ? 'ok' : '';
    pill.title = EngineNet.hasProxy() ? 'Data relay configured' : 'Set up the data relay to capture new rounds';
    EngineNet.onChange(() => {
      label.textContent = EngineNet.hasProxy() ? 'Capture connected' : 'Connect live capture';
      pill.className = EngineNet.hasProxy() ? 'ok' : '';
    });

    function show(on) {
      modal.classList.toggle('hidden', !on);
      if (on) { input.value = display(EngineNet.getProxy()); input.focus(); }
    }
    pill.addEventListener('click', () => show(true));
    modal.querySelector('#relayClose').addEventListener('click', () => show(false));
    modal.addEventListener('click', e => { if (e.target === modal) show(false); });

    // "Capture now" without a relay should open the setup dialog instead of doing nothing.
    document.addEventListener('click', e => {
      if (!EngineNet.hasProxy() && e.target.closest && e.target.closest('#btnSync')) {
        e.preventDefault();
        e.stopPropagation();
        show(true);
      }
    }, true);

    modal.querySelector('#relayTest').addEventListener('click', async () => {
      const before = EngineNet.getProxy();
      const candidate = input.value.trim();
      if (!candidate) { msg.className = 'msg bad'; msg.textContent = 'Paste the Worker URL first.'; return; }
      msg.className = 'msg'; msg.textContent = 'Testing…';
      EngineNet.setProxy(candidate);
      try {
        const j = await EngineNet.call('https://stadium-tv-api.bet9ja.com/game/init');
        const games = j && j.data && j.data.games;
        if (!games) throw new Error('The relay answered, but not with League Plus data.');
        msg.className = 'msg good';
        msg.textContent = `Relay works ✓ — ${games.length} League Plus games visible.`;
      } catch (e) {
        EngineNet.setProxy(before);
        msg.className = 'msg bad';
        msg.textContent = 'Relay test failed: ' + e.message;
      }
    });

    modal.querySelector('#relaySave').addEventListener('click', () => {
      const candidate = input.value.trim();
      if (!candidate) { msg.className = 'msg bad'; msg.textContent = 'Paste the Worker URL first.'; return; }
      EngineNet.setProxy(candidate);
      msg.className = 'msg good';
      msg.textContent = 'Saved. Reloading to start capture…';
      setTimeout(() => location.reload(), 500);
    });

    modal.querySelector('#relayCopy').addEventListener('click', async () => {
      try {
        const text = await (await fetch('../proxy/worker.js')).text();
        await navigator.clipboard.writeText(text);
        msg.className = 'msg good'; msg.textContent = 'Worker code copied. Paste it into the Cloudflare editor.';
      } catch (e) {
        msg.className = 'msg bad';
        msg.textContent = 'Could not copy. Open proxy/worker.js in a new tab instead.';
      }
    });
  }

  // Allow ?proxy=... to configure a deployment without opening the dialog.
  try {
    const u = new URL(location.href);
    const q = u.searchParams.get('proxy');
    if (q) {
      EngineNet.setProxy(q);
      u.searchParams.delete('proxy');
      history.replaceState({}, '', u.toString());
    }
  } catch (e) { }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
