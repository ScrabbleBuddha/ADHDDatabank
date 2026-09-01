/**
 * General Reading & Open Access Articles — read-only public data endpoint.
 *
 * Same pattern as the peer-reviewed research databank's Worker: this fetches
 * data/general_reading_master.csv directly from GitHub on every request (no
 * caching, so a git push is live immediately) and returns it as JSON.
 *
 * Unlike the peer-reviewed Worker, this one treats BOTH "Final" and
 * "Verified" as ready-to-publish statuses, since that's the convention used
 * for this dataset. Any other status value is held back (not yet ready).
 *
 * This Worker is its own standalone project — separate from both the
 * peer-reviewed research Worker and the clinician portal's Basic Auth
 * Worker. Each dataset gets its own Worker so a mistake in one never risks
 * the others.
 *
 * CONFIGURATION
 * Set GITHUB_RAW_CSV_URL in wrangler.toml to the raw.githubusercontent.com
 * URL of data/general_reading_master.csv in the same ADHDDatabank repo:
 *
 *   https://raw.githubusercontent.com/ScrabbleBuddha/ADHDDatabank/main/data/general_reading_master.csv
 *
 * UPDATING DATA
 * Edit data/general_reading_master.csv in the repo (add rows, keep the same
 * 13 columns), commit, and push. No redeploy of this Worker is needed.
 */

const READY_STATUSES = ['final', 'verified'];

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      const csvUrl = env.GITHUB_RAW_CSV_URL;
      if (!csvUrl) {
        return jsonResponse({ error: 'GITHUB_RAW_CSV_URL is not configured.' }, 500);
      }

      const res = await fetch(csvUrl, { cf: { cacheTtl: 0 } });
      if (!res.ok) {
        return jsonResponse({ error: `Could not fetch CSV (status ${res.status})` }, 502);
      }
      const csvText = await res.text();

      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        return jsonResponse([]);
      }

      const headers = rows[0].map(h => h.trim());
      const dataRows = rows.slice(1).filter(r => r.some(cell => cell.trim() !== ''));

      const records = dataRows
        .map(row => rowToRecord(headers, row))
        .filter(r => r.id)
        .filter(r => READY_STATUSES.includes(String(r.status).trim().toLowerCase()));

      return jsonResponse(records);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500);
    }
  }
};

function rowToRecord(headers, row) {
  const get = (name) => {
    const idx = headers.indexOf(name);
    return idx === -1 ? '' : (row[idx] || '');
  };

  return {
    id: String(get('ID') || '').trim(),
    section: String(get('Section') || '').trim(),
    status: String(get('Status') || '').trim(),
    resourceType: String(get('Resource Type') || '').trim(),
    author: String(get('Author / Speaker') || '').trim(),
    title: String(get('Title') || '').trim(),
    publication: String(get('Publication / Platform') || '').trim(),
    date: String(get('Date') || '').trim(),
    url: String(get('URL') || '').trim(),
    whyItMatters: String(get('Why It Matters') || '').trim(),
    scaffoldRelevance: String(get('Scaffold Relevance') || '').trim(),
    audience: String(get('Audience') || '').trim(),
    accessNotes: String(get('Access Notes') || '').trim()
  };
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip, \n handles the line break */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += c; }
  }

  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders()
    }
  });
}
