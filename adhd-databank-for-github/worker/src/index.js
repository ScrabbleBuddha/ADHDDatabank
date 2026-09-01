/**
 * ADHD Scaffolds Research Databank — read-only public data endpoint.
 *
 * Source of truth is a CSV file living in this same GitHub repo
 * (data/adhd_research_master.csv). This Worker fetches that file's raw
 * content on every request, parses it, filters to Status = Final, and
 * returns JSON — with no caching, so a git push is live immediately.
 *
 * This Worker is deployed as its own standalone project, unrelated to
 * any Worker used by the clinician portal (that one exists purely to
 * gate portal.steffanpiper.com behind Basic Auth — a different job on
 * different infrastructure). This endpoint is intentionally public and
 * unauthenticated, matching the databank's no-login requirement.
 *
 * CONFIGURATION
 * Set GITHUB_RAW_CSV_URL in wrangler.toml to the raw.githubusercontent.com
 * URL of data/adhd_research_master.csv in your actual repo, e.g.:
 *
 *   https://raw.githubusercontent.com/<your-username>/<your-repo>/main/data/adhd_research_master.csv
 *
 * UPDATING DATA
 * Edit data/adhd_research_master.csv in the repo (add rows, keep the same
 * 19 columns), commit, and push. No redeploy of this Worker is needed —
 * it re-fetches the file fresh on every request.
 */

const STANDARD_HEADERS = [
  'ID', 'Section', 'Status', 'Pass', 'Subtopic', 'Authors', 'Year',
  'Article Title', 'Journal', 'Volume / Issue / Pages', 'Study Type',
  'Population / Scope', 'DOI', 'DOI URL', 'Full Text URL', 'PDF Available',
  'Hosting Status', 'Tags', 'Suggested Local Filename'
];

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
        .filter(r => String(r.status).trim().toLowerCase() === 'final');

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

  const yearRaw = get('Year');
  const tagsRaw = String(get('Tags') || '');

  return {
    id: String(get('ID') || '').trim(),
    section: String(get('Section') || '').trim(),
    status: String(get('Status') || '').trim(),
    pass: String(get('Pass') || '').trim(),
    subtopic: String(get('Subtopic') || '').trim(),
    authors: String(get('Authors') || '').trim(),
    year: yearRaw ? Number(yearRaw) : null,
    title: String(get('Article Title') || '').trim(),
    journal: String(get('Journal') || '').trim(),
    volIssuePages: String(get('Volume / Issue / Pages') || '').trim(),
    studyType: String(get('Study Type') || '').trim(),
    population: String(get('Population / Scope') || '').trim(),
    doi: String(get('DOI') || '').trim(),
    doiUrl: String(get('DOI URL') || '').trim(),
    fullTextUrl: String(get('Full Text URL') || '').trim(),
    pdfAvailable: String(get('PDF Available') || '').trim(),
    hostingStatus: String(get('Hosting Status') || '').trim(),
    tags: tagsRaw.split(';').map(t => t.trim()).filter(Boolean),
    suggestedLocalFilename: String(get('Suggested Local Filename') || '').trim()
  };
}

/**
 * Minimal RFC4180-style CSV parser: handles quoted fields, embedded commas,
 * embedded newlines inside quotes, and doubled "" escaped quotes. Returns
 * an array of rows, each an array of string cells.
 */
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
