# ADHD Scaffolds Research Databank — Setup Guide (GitHub + Cloudflare Worker)

This version keeps the research data as a plain CSV file in a GitHub repo.
A Cloudflare Worker reads that file directly from GitHub on every request,
filters it to `Status = Final`, and serves it as JSON. The public page
fetches from the Worker. Updating the data is just: edit the CSV, commit,
push — no redeploy needed.

This Worker is completely separate from the clinician portal's Worker.
That one exists only to put a Basic Auth wall in front of
`portal.steffanpiper.com` — a different job, different project. This one
is public and unauthenticated by design, matching the databank's
no-login requirement, which is exactly why the two must never be merged.

## What's in this folder

```
data/adhd_research_master.csv   → the 149 records (77 Final + 72 Candidate)
worker/src/index.js             → the Cloudflare Worker (fetches + serves JSON)
worker/wrangler.toml             → Worker config (one line to edit)
public/adhd-research/index.html → the databank page (drop into your site)
README.md                        → this file
```

## Step 1 — Create the GitHub repo

1. Create a new repository (public or private both work — the Worker
   reads raw file content either way, though a private repo needs a
   small tweak covered at the bottom of this guide).
2. Push this entire folder's contents to that repo, preserving the
   structure above (`data/`, `worker/`, `public/`).

## Step 2 — Point the Worker at your CSV

1. Open `worker/wrangler.toml`.
2. Replace the placeholder with your repo's actual raw file URL:

   ```
   GITHUB_RAW_CSV_URL = "https://raw.githubusercontent.com/<your-username>/<your-repo>/main/data/adhd_research_master.csv"
   ```

   (Swap in your GitHub username, repo name, and branch if it's not `main`.)

## Step 3 — Deploy the Worker

You'll need [Node.js](https://nodejs.org) installed once, then:

```bash
cd worker
npx wrangler login       # opens a browser to authorize your Cloudflare account
npx wrangler deploy
```

Wrangler will print a URL like:

```
https://adhd-research-databank-api.<your-subdomain>.workers.dev
```

That's your `DATA_URL`.

## Step 4 — Wire the URL into the page

1. Open `public/adhd-research/index.html`.
2. Find this line near the top of the `<script>` block:

   ```js
   const DATA_URL = "PASTE_YOUR_WORKERS_DEV_URL_HERE";
   ```

3. Replace the placeholder with the `workers.dev` URL from Step 3.
4. Save the file.

## Step 5 — Deploy the page

Drop `index.html` into your existing `piper-practice` Cloudflare Pages
project at `/adhd-research/index.html` (or your preferred route), and
deploy through your normal zip-upload process. Link to it from the ADHD
Scaffolds book page whenever you're ready.

## Adding new sections later

No redeploy of the Worker or the page is required:

1. Open `data/adhd_research_master.csv` (in the repo, or a local clone).
2. Append the new section's rows, matching the same 19 columns.
3. Set `Status` to `Final` for anything ready to go public, or leave it
   as `Candidate` / `Pass 1` to keep it staged.
4. Commit and push. The Worker fetches fresh on every request, so the
   change is live immediately — no `wrangler deploy` needed for data
   updates, only for changes to the Worker's own code.

If a row is missing an optional value (e.g. `Pass`), just leave that
cell blank; the Worker tolerates missing values.

## If your repo is private

`raw.githubusercontent.com` URLs for private repos require an auth
token. The simplest fix is to keep this repo public — the CSV itself
contains only citation metadata (titles, authors, DOIs), nothing
sensitive. If you'd rather keep it private, let me know and I'll adjust
the Worker to authenticate with a GitHub personal access token stored
as a Cloudflare secret instead of a plain URL.

## A note on PDFs

This setup only ever links out to DOI/publisher/PubMed Central — it
doesn't serve any hosted PDF files. If you want a "Download PDF" button
to appear for a specific `Rehosting Permitted` record, that's a separate
later step (hosting the actual file somewhere and pointing the record
at it) — nothing here does that automatically, since rehosting rights
need to be checked per record.
