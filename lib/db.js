// Shared helpers for the RSVP database (Cloudflare D1, bound as `DB`).

export const SCHEMA = `CREATE TABLE IF NOT EXISTS rsvps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  attending INTEGER NOT NULL,
  guests INTEGER NOT NULL DEFAULT 0,
  dietary TEXT,
  camping INTEGER NOT NULL DEFAULT 0,
  song TEXT,
  note TEXT,
  user_agent TEXT
)`;

let ready = false;

// Creates the table on first use, so no manual SQL step is needed.
export async function db(env) {
  if (!env.DB) throw new Error('D1 database binding "DB" is not configured');
  if (!ready) {
    await env.DB.prepare(SCHEMA).run();
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
    .prepare('SELECT * FROM rsvps ORDER BY created_at DESC, id DESC')
    .all();
  return results;
}
