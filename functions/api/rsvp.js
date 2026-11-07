// POST /api/rsvp  — stores one RSVP in D1.
import { db, json } from '../../lib/db.js';

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  // Honeypot: real guests never see or fill this field.
  if (text(body.website, 200)) return json({ ok: true });

  const name = text(body.name, 200);
  if (!name) return json({ ok: false, error: 'Name is required' }, 400);

  const attending = body.attending === true;
  const guests = attending ? Math.min(Math.max(parseInt(body.guests, 10) || 1, 1), 10) : 0;

  try {
    await (await db(env))
      .prepare(
        `INSERT INTO rsvps (name, attending, guests, dietary, camping, song, note, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        name,
        attending ? 1 : 0,
        guests,
        attending ? text(body.dietary, 500) : '',
        attending && body.camping === true ? 1 : 0,
        attending ? text(body.song, 300) : '',
        text(body.note, 2000),
        text(request.headers.get('User-Agent') || '', 300)
      )
      .run();
  } catch (err) {
    console.error('RSVP insert failed', err);
    return json({ ok: false, error: 'Could not save your reply' }, 500);
  }

  return json({ ok: true });
}

export function onRequest() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
