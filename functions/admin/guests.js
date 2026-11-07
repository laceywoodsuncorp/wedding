// /admin/guests (password-protected)
//   GET  : downloads the guest list as CSV, with each personal invite link.
//   POST : changes to the guest list from the admin page (add, import, update, delete, mark sent, message).
import { checkAdmin, db, DEFAULT_MESSAGE, newCode } from '../../lib/db.js';
import { csvCell } from '../../lib/csv.js';

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const count = (v) => Math.min(Math.max(parseInt(v, 10) || 1, 1), 10);

function back(request, done) {
  return Response.redirect(new URL('/admin' + (done ? '?done=' + done : ''), request.url).toString(), 303);
}

// Blocks other websites from submitting forms here using your saved login.
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  const site = request.headers.get('Sec-Fetch-Site');
  return !site || site === 'same-origin';
}

async function insertGuest(DB, g) {
  // Retry on the (very unlikely) chance of a duplicate code.
  for (let i = 0; i < 5; i++) {
    try {
      await DB.prepare('INSERT INTO guests (code, name, phone, email, max_guests, notes) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newCode(), g.name, g.phone, g.email, g.max_guests, g.notes)
        .run();
      return;
    } catch (err) {
      if (!/UNIQUE/i.test(String(err))) throw err;
    }
  }
  throw new Error('Could not create a unique invite code');
}

const fields = (f) => ({
  name: text(f.get('name'), 200),
  phone: text(f.get('phone'), 40),
  email: text(f.get('email'), 200),
  max_guests: count(f.get('max_guests')),
  notes: text(f.get('notes'), 500),
});

export async function onRequestPost({ request, env }) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });

  const f = await request.formData();
  const DB = await db(env);
  const code = text(f.get('code'), 12);

  switch (f.get('action')) {
    case 'add': {
      const g = fields(f);
      if (g.name) await insertGuest(DB, g);
      return back(request, 'added');
    }
    case 'import': {
      const lines = text(f.get('lines'), 100000).split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = (line.includes('\t') ? line.split('\t') : line.split(',')).map((p) => p.trim().replace(/^"|"$/g, ''));
        const [name, phone = '', email = '', n = ''] = parts;
        if (!name || /^name$/i.test(name)) continue; // skip blank names and a header row
        await insertGuest(DB, { name: name.slice(0, 200), phone: phone.slice(0, 40), email: email.slice(0, 200), max_guests: count(n || 2), notes: '' });
      }
      return back(request, 'added');
    }
    case 'update': {
      const g = fields(f);
      if (g.name) {
        await DB.prepare('UPDATE guests SET name = ?, phone = ?, email = ?, max_guests = ?, notes = ? WHERE code = ?')
          .bind(g.name, g.phone, g.email, g.max_guests, g.notes, code)
          .run();
      }
      return back(request, 'saved');
    }
    case 'delete':
      await DB.prepare('DELETE FROM guests WHERE code = ?').bind(code).run();
      return back(request, 'removed');
    case 'sent':
      await DB.prepare("UPDATE guests SET sent_at = COALESCE(sent_at, datetime('now')) WHERE code = ?").bind(code).run();
      return f.get('quiet') ? new Response(null, { status: 204 }) : back(request, 'saved');
    case 'unsent':
      await DB.prepare('UPDATE guests SET sent_at = NULL WHERE code = ?').bind(code).run();
      return back(request, 'saved');
    case 'message': {
      const msg = text(f.get('message'), 4000).replace(/\r\n/g, '\n');
      await DB.prepare("INSERT INTO settings (key, value) VALUES ('message', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
        .bind(msg || DEFAULT_MESSAGE)
        .run();
      return back(request, 'message');
    }
    case 'message-reset':
      await DB.prepare("DELETE FROM settings WHERE key = 'message'").run();
      return back(request, 'message');
    default:
      return new Response('Unknown action', { status: 400 });
  }
}

export async function onRequestGet({ request, env }) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  const DB = await db(env);
  const origin = new URL(request.url).origin;
  const { results } = await DB.prepare(
    `SELECT g.*, r.attending, r.guests AS coming, r.updated_at AS replied_at
     FROM guests g LEFT JOIN guest_rsvps r ON r.name_key = 'invite:' || g.code
     ORDER BY g.name COLLATE NOCASE`
  ).all();
  const cols = ['Name', 'Mobile', 'Email', 'Guests invited', 'Notes', 'Invite link', 'Invite sent', 'Reply', 'Guests coming', 'Replied at'];
  const lines = [cols.join(',')];
  for (const g of results) {
    const reply = g.replied_at == null ? 'Awaiting' : g.attending ? 'Coming' : 'Not coming';
    lines.push(
      [g.name, g.phone, g.email, g.max_guests, g.notes, `${origin}/i/${g.code}`, g.sent_at || '', reply, g.replied_at == null ? '' : g.coming, g.replied_at || '']
        .map(csvCell)
        .join(',')
    );
  }
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="guest-list.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
