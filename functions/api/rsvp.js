// POST /api/rsvp: saves a guest's RSVP, replacing any earlier reply from the same guest.
import { db, json, nameKey, RSVP_CLOSES } from '../../lib/db.js';

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function onRequestPost({ request, env }) {
  if (new Date() >= RSVP_CLOSES) {
    return json({ ok: false, error: 'RSVPs closed on 31 July 2027' }, 410);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  // Honeypot: real guests never see or fill this field.
  if (text(body.website, 200)) return json({ ok: true });

  const name = text(body.name, 200).replace(/\s+/g, ' ');
  const key = nameKey(name);
  if (!key) return json({ ok: false, error: 'Name is required' }, 400);

  const attending = body.attending === true;
  const guests = attending ? Math.min(Math.max(parseInt(body.guests, 10) || 1, 1), 10) : 0;
  const token = text(body.token, 100) || null;

  try {
    const DB = await db(env);
    const statements = [];
    // Same device replied before under a differently written name: drop that older reply.
    if (token) {
      statements.push(
        DB.prepare('DELETE FROM guest_rsvps WHERE token = ? AND name_key <> ?').bind(token, key)
      );
    }
    statements.push(
      DB.prepare(
        `INSERT INTO guest_rsvps (name_key, name, attending, guests, dietary, camping, song, note, token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (name_key) DO UPDATE SET
           name = excluded.name,
           attending = excluded.attending,
           guests = excluded.guests,
           dietary = excluded.dietary,
           camping = excluded.camping,
           song = excluded.song,
           note = excluded.note,
           token = excluded.token,
           updated_at = datetime('now')`
      ).bind(
        key,
        name,
        attending ? 1 : 0,
        guests,
        attending ? text(body.dietary, 500) : '',
        attending && body.camping === true ? 1 : 0,
        attending ? text(body.song, 300) : '',
        text(body.note, 2000),
        token
      )
    );
    await DB.batch(statements);
  } catch (err) {
    console.error('RSVP save failed', err);
    return json({ ok: false, error: 'Could not save your reply' }, 500);
  }

  return json({ ok: true });
}

export function onRequest() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
