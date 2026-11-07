# START HERE — beginner setup, step by step

This guide assumes **Windows** and that the project folder is:

```
D:\Downloads\deepseek\bet9ja-engines
```

If you extracted the zip somewhere else, use that path instead.

You will do three things, once:

1. Put the website on **GitHub Pages** (free hosting).
2. Put the **24/7 League Plus collector** on Cloudflare (free).
3. Connect the website to the collector.

After that, **nothing has to stay open on your PC** for League Plus to keep recording.

Time: about 20–30 minutes. Cost: **£0 / $0** on the free plans.

---

## Before you start

You need three free accounts/things:

| Thing | Why | Link |
|---|---|---|
| GitHub account | Hosts the website | https://github.com/signup |
| Cloudflare account | Runs the 24/7 collector | https://dash.cloudflare.com/sign-up |
| Node.js on this PC | Deploys the collector | Already installed (v24) |

Check Node.js is installed. Open **PowerShell** (Windows key → type `PowerShell` → Enter) and run:

```powershell
node --version
```

You should see something like `v24.14.1`. If you see an error, install the LTS version from
https://nodejs.org and reopen PowerShell.

> **PowerShell safety note:** this PC blocks the normal `npm` and `npx` shortcuts with a
> "running scripts is disabled" error. That is why every command below uses **`npm.cmd`**
> and **`npx.cmd`**. Use those exact names. On macOS/Linux you would drop the `.cmd`.

---

# Part 1 — Put the website on GitHub Pages

## Step 1.1 — Create the repository

1. Sign in at https://github.com.
2. Click the **+** in the top-right corner → **New repository**.
3. Fill in:
   - **Repository name:** `bet9ja-engines`
   - **Visibility:** **Public** (important — free GitHub Pages needs public)
   - Do **not** tick "Add a README file".
4. Click **Create repository**.

You now see an empty repository page with a link like **"uploading an existing file"**.

## Step 1.2 — Upload the website files

1. Open **File Explorer** and go to:
   ```
   D:\Downloads\deepseek\bet9ja-engines
   ```
2. Press **Ctrl+A** to select everything **inside** the folder.
3. Drag the selected items into the browser's upload area (or click **choose your files**
   and select them).

   **Important:** drag the *contents* — `index.html`, `zoom`, `leagueplus`, `shared`,
   `seed`, `proxy`, `collector`, `scripts`, etc. Do **not** drag the outer
   `bet9ja-engines` folder itself, or the site will end up one level too deep.
4. Wait for the file list to finish (about 80 files, a few MB).
5. Click **Commit changes**.

> **If you already uploaded the site before the 24/7 collector was added:** upload this
> folder's contents again and commit. GitHub will replace the changed files. Make sure
> these are present: `shared/server.js`, `shared/boot-leagueplus.js`,
> `leagueplus/dashboard.js`, `leagueplus/dashboard.html`, the updated `proxy/worker.js`,
> and the whole `collector` folder.

If dragging folders does not work in your browser, install **GitHub Desktop**
(https://desktop.github.com), choose *File → Add local repository*, select the
`bet9ja-engines` folder, then **Publish repository**. Make sure it is public.

## Step 1.3 — Turn on GitHub Pages

1. In the repository, click **Settings** (top tab).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose **main** and folder **/ (root)**.
5. Click **Save**.
6. Wait 1–2 minutes, then refresh this page. A banner appears with your site address:
   ```
   https://YOUR-USERNAME.github.io/bet9ja-engines/
   ```

Open that address. You should see the dark landing page with the three engine cards.
Click **Open League Plus** — the dashboard should load with starter data (it may take a
few seconds the first time; the starter database is ~2.5 MB).

> If you get **404**, wait another minute and refresh. Check that `index.html` is at the
> top level of the repository, not inside a second `bet9ja-engines` folder.

---

# Part 2 — Deploy the 24/7 collector

This is the part that lets League Plus record while your PC is off.

## Step 2.1 — Open PowerShell in the collector folder

Easiest way:

1. Open File Explorer at:
   ```
   D:\Downloads\deepseek\bet9ja-engines\collector
   ```
2. Click the address bar at the top, type `powershell`, press **Enter**.

A blue/black PowerShell window opens already in that folder.

(Alternative: open PowerShell and run
`cd "D:\Downloads\deepseek\bet9ja-engines\collector"`.)

## Step 2.2 — Install the deploy tool

In PowerShell, run:

```powershell
npm.cmd install
```

Wait until it finishes (it may take several minutes and print "added … packages").
You only do this once.

## Step 2.3 — Log in to Cloudflare

Run:

```powershell
npx.cmd wrangler login
```

- A browser window opens asking you to authorise Wrangler.
- Sign in to your Cloudflare account (create one free at
  https://dash.cloudflare.com/sign-up if needed).
- Click **Allow**.
- Go back to PowerShell; it should say **"Successfully logged in"**.

If the browser does not open, copy the URL printed in PowerShell into Chrome yourself.

## Step 2.4 — Create the database

Run:

```powershell
npx.cmd wrangler d1 create bet9ja-collector
```

It prints a block containing a line like:

```
database_id = "1234abcd-5678-90ef-1234-567890abcdef"
```

**Copy that ID** (the long string inside the quotes) into Notepad — you need it in the
next step. Keep PowerShell open.

## Step 2.5 — Put the ID into the config file

1. Open File Explorer at:
   ```
   D:\Downloads\deepseek\bet9ja-engines\collector
   ```
2. Right-click **`wrangler.toml`** → **Open with** → **Notepad**.
3. Find this line:

   ```toml
   database_id = "00000000-0000-0000-0000-000000000000"
   ```

4. Replace the zeros with your ID, keeping the quotes:

   ```toml
   database_id = "1234abcd-5678-90ef-1234-567890abcdef"
   ```

5. **File → Save** (not "Save As"). Close Notepad.

## Step 2.6 — Create the tables

Back in PowerShell, run:

```powershell
npx.cmd wrangler d1 migrations apply bet9ja-collector --remote
```

If it asks **"About to apply 1 migration(s) … continue?"**, type `y` and press Enter.

You should see **"4 commands executed successfully"**.

## Step 2.7 — Deploy the Worker

Run:

```powershell
npx.cmd wrangler deploy
```

Wait for the output. It includes:

- a URL like `https://bet9ja-collector.your-name.workers.dev`
- a schedule line `* * * * *`

**Copy the URL** (no `/api`, no trailing slash needed). This is the address of your
collector. If Cloudflare asks you to choose a `workers.dev` subdomain, pick one
(e.g. your name), then run `npx.cmd wrangler deploy` again.

## Step 2.8 — Check it is alive

Open this in your browser (replace with your URL):

```
https://YOUR-WORKER.workers.dev/api/lp/status
```

You should see JSON like:

```json
{
  "ok": true,
  "service": "bet9ja-collector",
  "version": 1,
  "rounds": 0,
  "lastRound": null,
  "lastError": null
}
```

`rounds` may be `0` for the first minute or two. Reload after 2–3 minutes; it should
start counting up. If `lastError` is not `null`, see Troubleshooting.

---

# Part 3 — Connect the website

1. Open your GitHub Pages site:
   ```
   https://YOUR-USERNAME.github.io/bet9ja-engines/
   ```
2. Click **Open League Plus**.
3. In the bottom-right corner, click the pill **Connect live capture**.
4. Paste your Worker URL, e.g.
   ```
   https://bet9ja-collector.your-name.workers.dev
   ```
   Do **not** add `/api/lp` or `?url=`.
5. Click **Save & start capturing**. The page reloads.
6. Wait a few seconds. Under the page title you should see:
   ```
   … matches recorded · … rounds · last check … · 24/7 collector
   ```
   The words **24/7 collector** are the confirmation that the page found the Worker.

Open the League Plus dashboard again after a few minutes; the number of matches/rounds
should grow even if you close the tab in between.

> The same Worker URL is also used as the relay for Zoom Soccer/Tennis. One URL covers both
> jobs; you do **not** need to deploy `proxy/worker.js` separately.

---

# Part 4 — The 60-second checklist

After setup, confirm all of these:

- [ ] The GitHub Pages URL opens the landing page.
- [ ] League Plus opens and shows starter data.
- [ ] `https://YOUR-WORKER.workers.dev/api/lp/status` shows
      `service: "bet9ja-collector"` and `lastError: null`.
- [ ] The League Plus header says **24/7 collector**.
- [ ] After a few minutes, the round/match counts on League Plus increase on refresh.
- [ ] You can close the browser, reopen the site later, and the League Plus numbers have
      still moved forward.

If all six are true, you are done.

---

# Part 5 — Daily use

- **Nothing needs to stay on.** The collector runs on Cloudflare, the website runs on
  GitHub Pages. Your PC can be off.
- Open the site from any device. On a **new** device, paste the Worker URL into the pill
  once (it is remembered per browser).
- **League Plus** gets fresh data from the collector every minute.
- The collector keeps **30 days** of League Plus rounds on Cloudflare. Your browser keeps
  its own longer history; export a backup from Settings if you care about it.
- **Zoom Soccer/Tennis** backfill when you open them: their feeds keep the current and
  previous season, so finished matches are not lost while you are away. The current
  round's board may be one round behind until the page syncs.
- **Live in-play** is still not available in the hosted build (it needed the browser
  extension to read Bet9ja's page).
- In any dashboard, **Settings → Export full backup** downloads your browser's data.
  Do that now and then.

---

# Troubleshooting

| Problem | What to do |
|---|---|
| `running scripts is disabled on this system` | You used `npm`/`npx`. Use **`npm.cmd`** / **`npx.cmd`** exactly. |
| `'wrangler' is not recognized` | You are not in the `collector` folder, or `npm.cmd install` did not finish. `cd` to the folder and run `npm.cmd install` again. |
| `wrangler login` does not open a browser | Copy the URL printed in PowerShell into Chrome manually. |
| `d1 create` says the database already exists | Run `npx.cmd wrangler d1 list`, copy the existing `database_id` into `wrangler.toml`. |
| `migrations apply` says it cannot find the database | The ID in `wrangler.toml` is wrong/not saved. Recheck Step 2.5. |
| `wrangler deploy` says the D1 binding is missing | Same: `database_id` must match the database you created. |
| `/api/lp/status` returns 500 | The tables were not created. Run Step 2.6 again. |
| `/api/lp/status` returns 404 | You used the wrong URL. It should be the Worker root + `/api/lp/status`. |
| `lastError` shows 403 / Access Denied | Bet9ja/Akamai refused Cloudflare's IP. The free collector cannot record LP; use the local relay fallback (PC must stay on) or ask me to switch it. |
| League Plus does not say **24/7 collector** | Make sure the pill contains the collector URL (not the old relay URL), save, and hard-refresh with **Ctrl+F5**. Check the status URL. |
| GitHub Pages shows 404 | Wait 1–2 minutes; check Settings → Pages says branch `main`, folder `/ (root)`; check `index.html` is at the repo root. |
| The repo has a nested `bet9ja-engines` folder | You dragged the outer folder. Delete the repo and redo Step 1.2, dragging the *contents*. |
| Site loads but is blank | Hard-refresh Ctrl+F5. The starter data is ~2.5 MB and can take a few seconds on first load. |
| Upload page ignores folders | Use GitHub Desktop (free) to publish the folder. |

---

# What is running where (plain English)

| Piece | Where it runs | What it does |
|---|---|---|
| The website (`index.html`, `zoom/`, `leagueplus/`) | GitHub Pages | The dashboards you open in a browser |
| The collector (`collector/`) | Cloudflare Worker + D1 | Polls League Plus every minute, stores rounds, serves the site |
| The relay (`proxy/worker.js`) | Cloudflare Worker | Only needed if you do **not** deploy the collector; the collector includes the same relay |
| Your browser data | IndexedDB on your device | Your personal history/backups |

The website and the collector talk over the Worker URL. The collector does not need your
PC, a browser tab, or a server you maintain.

---

# If you get stuck

Send me:

1. The exact step number.
2. The exact error text from PowerShell (copy-paste, no screenshot needed).
3. The output of `https://YOUR-WORKER.workers.dev/api/lp/status` (or the error).

That is enough to diagnose almost anything.
