// Shared helpers for the RSVP database (Cloudflare D1, bound as `DB`).

// RSVPs close at the end of 31 July 2027, Queensland time (AEST, UTC+10).
export const RSVP_CLOSES = new Date('2027-08-01T00:00:00+10:00');

// One row per guest. `name_key` is the name lower-cased with spacing tidied,
// so "Jo Smith" and "jo  smith" count as the same guest; a new reply replaces the old one.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS guest_rsvps (
    name_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    attending INTEGER NOT NULL,
    guests INTEGER NOT NULL DEFAULT 0,
    dietary TEXT,
    camping INTEGER NOT NULL DEFAULT 0,
    song TEXT,
    note TEXT,
    token TEXT,
    first_replied_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS guest_rsvps_token ON guest_rsvps (token)`,
  // The invite list. Each invite has a short private code used in its personal link (/i/CODE).
  // A reply sent from that link is stored in guest_rsvps under name_key 'invite:CODE'.
  `CREATE TABLE IF NOT EXISTS guests (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    max_guests INTEGER NOT NULL DEFAULT 2,
    notes TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
];

export const inviteKey = (code) => 'invite:' + code;

// 6 characters, avoiding look-alikes (0/O, 1/I/L).
export function newCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export async function findGuest(DB, code) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{4,12}$/.test(code)) return null;
  return DB.prepare('SELECT * FROM guests WHERE code = ?').bind(code).first();
}

export const DEFAULT_MESSAGE = `Hi {name}! We're getting married 💜 and we'd love you to celebrate with us.

Friday 22 October 2027, from 2pm until late
Waterford Tamborine Road, with camping overnight

Your invitation, all the details and your RSVP are here:
{link}

Please reply by 31 July 2027.
Love, Lacey & Lachlan`;

export async function inviteMessage(DB) {
  const row = await DB.prepare("SELECT value FROM settings WHERE key = 'message'").first();
  return row?.value || DEFAULT_MESSAGE;
}

export const nameKey = (name) => name.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();

let ready = false;

// Creates the table on first use, so no manual SQL step is needed.
export async function db(env) {
  if (!env.DB) throw new Error('D1 database binding "DB" is not configured');
  if (!ready) {
    await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
    ready = true;
  }
  return env.DB;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// HTTP Basic Auth against the ADMIN_PASSWORD secret (any username).
export function checkAdmin(request, env) {
  const unauthorized = new Response('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Wedding RSVPs", charset="UTF-8"' },
  });
  if (!env.ADMIN_PASSWORD) {
    return new Response('ADMIN_PASSWORD is not set in Cloudflare Pages settings.', { status: 500 });
  }
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return unauthorized;
  let decoded = '';
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)));
  } catch {
    return unauthorized;
  }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) return unauthorized;
  return null;
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export async function allRsvps(env) {
  const { results } = await (await db(env))
    .prepare('SELECT * FROM guest_rsvps ORDER BY updated_at DESC')
    .all();
  return results;
}
