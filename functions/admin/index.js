// GET /admin : password-protected page with the invite list and every RSVP.
import { allRsvps, checkAdmin, db, inviteKey, inviteMessage } from '../../lib/db.js';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Digits only, in international form for WhatsApp; Australian 04xx numbers become 614xx.
function intlPhone(phone) {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1).replace(/\D/g, '');
  d = d.replace(/\D/g, '');
  if (d.startsWith('0')) return '61' + d.slice(1);
  return d;
}

function status(g, r) {
  if (r) return r.attending ? `<span class="pill y">Coming · ${esc(r.guests)}</span>` : '<span class="pill n">Can’t come</span>';
  if (g.sent_at) return '<span class="pill s">Invite sent</span>';
  return '<span class="pill">Not sent yet</span>';
}

export async function onRequestGet({ request, env }) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;

  const url = new URL(request.url);
  const origin = url.origin;
  const DB = await db(env);
  const [rows, guestRes, template] = await Promise.all([
    allRsvps(env),
    DB.prepare('SELECT * FROM guests ORDER BY name COLLATE NOCASE').all(),
    inviteMessage(DB),
  ]);
  const guests = guestRes.results;
  const byKey = new Map(rows.map((r) => [r.name_key, r]));
  const guestByKey = new Map(guests.map((g) => [inviteKey(g.code), g]));

  const yes = rows.filter((r) => r.attending);
  const headcount = yes.reduce((n, r) => n + (r.guests || 0), 0);
  const campers = yes.filter((r) => r.camping).reduce((n, r) => n + (r.guests || 0), 0);
  const invitedPeople = guests.reduce((n, g) => n + (g.max_guests || 0), 0);
  const awaiting = guests.filter((g) => !byKey.has(inviteKey(g.code))).length;

  const guestRows = guests
    .map((g) => {
      const r = byKey.get(inviteKey(g.code));
      const link = `${origin}/i/${g.code}`;
      const msg = template.replaceAll('{name}', g.name).replaceAll('{link}', link);
      const subject = 'You’re invited: Lacey & Lachlan, 22 October 2027';
      const send = [
        g.phone ? `<a class="send" data-code="${g.code}" href="sms:${esc(g.phone.replace(/[^\d+]/g, ''))}?&body=${encodeURIComponent(msg)}">Text</a>` : '',
        g.phone ? `<a class="send" data-code="${g.code}" target="_blank" rel="noopener" href="https://wa.me/${intlPhone(g.phone)}?text=${encodeURIComponent(msg)}">WhatsApp</a>` : '',
        g.email ? `<a class="send" data-code="${g.code}" href="mailto:${esc(g.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}">Email</a>` : '',
        `<button type="button" class="send copy" data-code="${g.code}" data-msg="${esc(msg)}">Copy message</button>`,
      ].join('');
      return `<tr>
  <td><b>${esc(g.name)}</b>${g.notes ? `<small>${esc(g.notes)}</small>` : ''}</td>
  <td>${esc(g.phone)}${g.phone && g.email ? '<br>' : ''}${esc(g.email)}</td>
  <td>${esc(g.max_guests)}</td>
  <td>${status(g, r)}${g.sent_at ? `<small>Sent ${esc(g.sent_at.slice(0, 10))}</small>` : ''}</td>
  <td><div class="acts">${send}<a class="link" href="${esc(link)}" target="_blank" rel="noopener">Open their invite</a></div></td>
  <td>
    <details><summary>Edit</summary>
      <form method="post" action="/admin/guests" class="edit">
        <input type="hidden" name="code" value="${g.code}">
        <label>Name on invite<input name="name" value="${esc(g.name)}" required></label>
        <label>Mobile<input name="phone" value="${esc(g.phone)}" inputmode="tel"></label>
        <label>Email<input name="email" value="${esc(g.email)}" type="email"></label>
        <label>Guests invited<input name="max_guests" value="${esc(g.max_guests)}" type="number" min="1" max="10"></label>
        <label>Notes<input name="notes" value="${esc(g.notes)}"></label>
        <div class="row"><button name="action" value="update">Save</button>
          <button name="action" value="${g.sent_at ? 'unsent' : 'sent'}" class="plain">${g.sent_at ? 'Mark as not sent' : 'Mark as sent'}</button>
          <button name="action" value="delete" class="plain danger" data-confirm="Remove ${esc(g.name)} from the guest list?">Remove</button></div>
      </form>
    </details>
  </td>
</tr>`;
    })
    .join('');

  const replyRows = rows
    .map((r) => {
      const g = guestByKey.get(r.name_key);
      const sub = g ? (g.name !== r.name ? `<small>Invite: ${esc(g.name)}</small>` : '') : '<small>Replied without an invite link</small>';
      return `<tr>
  <td>${esc(r.updated_at)} UTC</td>
  <td>${esc(r.name)}${sub}</td>
  <td class="${r.attending ? 'y' : 'n'}">${r.attending ? 'Yes' : 'No'}</td>
  <td>${r.attending ? esc(r.guests) : ''}</td>
  <td>${esc(r.dietary)}</td>
  <td>${r.attending ? (r.camping ? 'Yes' : 'No') : ''}</td>
  <td>${esc(r.song)}</td>
  <td>${esc(r.note)}</td>
</tr>`;
    })
    .join('');

  const flash = {
    added: 'Guests added.', saved: 'Saved.', removed: 'Guest removed.', message: 'Invitation message saved.',
  }[url.searchParams.get('done')] || '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Wedding Admin</title>
<style>
:root{--bg:#F6F1EA;--ink:#2B2621;--muted:#6E6459;--rule:#DDD3C6;--accent:#7A5C9E;--card:#fff;--y:#3D7A4A;--n:#A2483F}
@media (prefers-color-scheme:dark){:root{--bg:#1B1917;--ink:#EEE7DE;--muted:#A99E92;--rule:#3A3530;--accent:#B9A0DA;--card:#24211E;--y:#7DBA89;--n:#E08A80}}
*{box-sizing:border-box}html{background:var(--bg)}body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding:24px 16px;max-width:1300px;margin:0 auto}
h1{font:400 2.2rem Georgia,serif;margin:0 0 16px}h2{font:400 1.6rem Georgia,serif;margin:36px 0 12px}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px}
.stat{background:var(--card);border:1px solid var(--rule);padding:12px 16px;min-width:120px;flex:1}
.stat b{display:block;font-size:1.6rem}.stat span{color:var(--muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.08em}
.muted{color:var(--muted)}a{color:var(--accent)}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--rule)}
table{border-collapse:collapse;width:100%;min-width:900px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
td small{display:block;color:var(--muted);font-size:.8rem}
td.y{color:var(--y)}td.n{color:var(--n)}
.pill{display:inline-block;padding:2px 10px;border-radius:99px;font-size:.8rem;border:1px solid var(--rule);white-space:nowrap}
.pill.y,.pill.n,.pill.s{border-color:currentColor}.pill.y{color:var(--y)}.pill.n{color:var(--n)}.pill.s{color:var(--accent)}
.acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:340px}
.send{font:inherit;font-size:.82rem;padding:5px 10px;border:1px solid var(--accent);color:var(--accent);background:none;text-decoration:none;cursor:pointer;border-radius:4px}
.send:hover{background:var(--accent);color:var(--card)}
.link{font-size:.82rem}
.panel{background:var(--card);border:1px solid var(--rule);padding:16px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end}
label{display:grid;gap:4px;font-size:.78rem;color:var(--muted)}
input,textarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--rule);padding:8px;border-radius:4px;width:100%}
textarea{min-height:120px}
button{font:inherit;padding:8px 16px;background:var(--accent);color:var(--card);border:0;border-radius:4px;cursor:pointer}
button.plain{background:none;color:var(--accent);border:1px solid var(--rule)}button.danger{color:var(--n)}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
details summary{cursor:pointer;color:var(--accent);font-size:.9rem}
form.edit{display:grid;gap:8px;min-width:240px;margin-top:8px}
.flash{background:var(--card);border-left:3px solid var(--y);padding:10px 14px;margin-bottom:16px}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 16px;border-radius:6px;opacity:0;transition:opacity .2s;pointer-events:none}
</style></head><body>
<h1>Lacey &amp; Lachlan: wedding admin</h1>
${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
<div class="stats">
  <div class="stat"><b>${guests.length}</b><span>Invites</span></div>
  <div class="stat"><b>${invitedPeople}</b><span>People invited</span></div>
  <div class="stat"><b>${guests.filter((g) => g.sent_at).length}</b><span>Invites sent</span></div>
  <div class="stat"><b>${awaiting}</b><span>Awaiting reply</span></div>
  <div class="stat"><b>${headcount}</b><span>Guests coming</span></div>
  <div class="stat"><b>${rows.length - yes.length}</b><span>Declined</span></div>
  <div class="stat"><b>${campers}</b><span>Camping</span></div>
</div>

<h2>Guest list</h2>
<p class="muted">Each invite has its own link. Opening it greets them by name, and their RSVP is matched to this list automatically.
The send buttons open your messages, WhatsApp or email app with the invitation ready to go. Best used from your phone.</p>

<div class="panel">
  <form method="post" action="/admin/guests" class="grid">
    <input type="hidden" name="action" value="add">
    <label>Name on invite<input name="name" placeholder="e.g. Jo &amp; Sam" required></label>
    <label>Mobile<input name="phone" placeholder="04xx xxx xxx" inputmode="tel"></label>
    <label>Email<input name="email" type="email" placeholder="optional"></label>
    <label>Guests invited<input name="max_guests" type="number" min="1" max="10" value="2"></label>
    <label>Notes<input name="notes" placeholder="optional, only you see this"></label>
    <button>Add guest</button>
  </form>
  <details style="margin-top:12px"><summary>Add lots at once (paste from a spreadsheet)</summary>
    <form method="post" action="/admin/guests" style="margin-top:8px">
      <input type="hidden" name="action" value="import">
      <label>One invite per line: <b>name, mobile, email, number of guests</b>. Commas or tabs both work; leave blanks empty.
        <textarea name="lines" placeholder="Jo &amp; Sam, 0412 345 678, jo@example.com, 2&#10;Aunty Pat, 0400 111 222, , 1"></textarea></label>
      <div class="row"><button>Add these guests</button></div>
    </form>
  </details>
</div>

<div class="wrap"><table>
<thead><tr><th>Invite</th><th>Contact</th><th>Invited</th><th>Status</th><th>Send invitation</th><th></th></tr></thead>
<tbody>${guestRows || '<tr><td colspan="6">No guests yet. Add your first one above.</td></tr>'}</tbody>
</table></div>

<details class="panel" style="margin-top:14px"><summary>Edit the invitation message</summary>
  <form method="post" action="/admin/guests" style="margin-top:10px">
    <label>Use <b>{name}</b> for the name on the invite and <b>{link}</b> for their personal link.
      <textarea name="message" style="min-height:280px">${esc(template)}</textarea></label>
    <div class="row"><button name="action" value="message">Save message</button><button name="action" value="message-reset" class="plain">Reset to the original</button></div>
  </form>
</details>

<h2>Replies</h2>
<p class="muted">One row per guest, showing their latest reply. Most recently updated first. RSVPs close 31 July 2027.<br>
<a href="/admin/export">Download replies (CSV)</a> · <a href="/admin/guests">Download guest list (CSV)</a></p>
<div class="wrap"><table>
<thead><tr><th>Last updated</th><th>Name</th><th>Attending</th><th>Guests</th><th>Dietary</th><th>Camping</th><th>Song</th><th>Note</th></tr></thead>
<tbody>${replyRows || '<tr><td colspan="8">No replies yet.</td></tr>'}</tbody>
</table></div>
<div id="toast" role="status"></div>
<script>
// Sending (or copying) an invitation marks it as sent.
function markSent(code){
  var f = new FormData(); f.append('action', 'sent'); f.append('code', code); f.append('quiet', '1');
  fetch('/admin/guests', {method: 'POST', body: f, keepalive: true});
}
function toast(t){ var el = document.getElementById('toast'); el.textContent = t; el.style.opacity = 1; setTimeout(function(){ el.style.opacity = 0; }, 2200); }
document.querySelectorAll('.send').forEach(function(a){
  a.addEventListener('click', function(){
    markSent(a.dataset.code);
    if(a.classList.contains('copy')){
      navigator.clipboard.writeText(a.dataset.msg).then(function(){ toast('Invitation copied. Paste it into any message.'); }, function(){ prompt('Copy this message:', a.dataset.msg); });
    }
  });
});
document.querySelectorAll('[data-confirm]').forEach(function(b){
  b.addEventListener('click', function(e){ if(!confirm(b.dataset.confirm)) e.preventDefault(); });
});
</script>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
