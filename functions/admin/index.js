// GET /admin — password-protected page listing every RSVP.
import { allRsvps, checkAdmin } from '../../lib/db.js';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function onRequestGet({ request, env }) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;

  const rows = await allRsvps(env);
  const yes = rows.filter((r) => r.attending);
  const headcount = yes.reduce((n, r) => n + (r.guests || 0), 0);
  const campers = yes.filter((r) => r.camping).reduce((n, r) => n + (r.guests || 0), 0);

  const body = rows
    .map(
      (r) => `<tr>
  <td>${esc(r.updated_at)} UTC</td>
  <td>${esc(r.name)}</td>
  <td class="${r.attending ? 'y' : 'n'}">${r.attending ? 'Yes' : 'No'}</td>
  <td>${r.attending ? esc(r.guests) : ''}</td>
  <td>${esc(r.dietary)}</td>
  <td>${r.attending ? (r.camping ? 'Yes' : 'No') : ''}</td>
  <td>${esc(r.song)}</td>
  <td>${esc(r.note)}</td>
</tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>RSVP Responses</title>
<style>
:root{--bg:#F6F1EA;--ink:#2B2621;--muted:#6E6459;--rule:#DDD3C6;--accent:#7A5C9E;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#1B1917;--ink:#EEE7DE;--muted:#A99E92;--rule:#3A3530;--accent:#B9A0DA;--card:#24211E}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding:24px 16px}
h1{font:400 2rem Georgia,serif;margin:0 0 16px}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
.stat{background:var(--card);border:1px solid var(--rule);padding:12px 16px;min-width:130px}
.stat b{display:block;font-size:1.6rem}.stat span{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.08em}
a.dl{display:inline-block;margin-bottom:16px;color:var(--accent)}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--rule)}
table{border-collapse:collapse;width:100%;min-width:800px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
td.y{color:#3D7A4A}td.n{color:#A2483F}
</style></head><body>
<h1>RSVP responses</h1>
<div class="stats">
  <div class="stat"><b>${rows.length}</b><span>Replies</span></div>
  <div class="stat"><b>${yes.length}</b><span>Accepted</span></div>
  <div class="stat"><b>${rows.length - yes.length}</b><span>Declined</span></div>
  <div class="stat"><b>${headcount}</b><span>Guests coming</span></div>
  <div class="stat"><b>${campers}</b><span>Camping</span></div>
</div>
<a class="dl" href="/admin/export">Download as spreadsheet (CSV)</a>
<p style="color:var(--muted);margin-top:0">One row per guest, showing their latest reply. Most recently updated first. Times are UTC. RSVPs close 31 July 2027.</p>
<div class="wrap"><table>
<thead><tr><th>Last updated</th><th>Name</th><th>Attending</th><th>Guests</th><th>Dietary</th><th>Camping</th><th>Song</th><th>Note</th></tr></thead>
<tbody>${body || '<tr><td colspan="8">No replies yet.</td></tr>'}</tbody>
</table></div>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
