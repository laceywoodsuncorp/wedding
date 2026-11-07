// POST /api/rsvp: saves a guest's RSVP, replacing any earlier reply from the same guest.
import { db, findGuest, inviteKey, json, nameKey, RSVP_CLOSES } from '../../lib/db.js';

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
  if (!nameKey(name)) return json({ ok: false, error: 'Name is required' }, 400);

  const attending = body.attending === true;
  const token = text(body.token, 100) || null;

  try {
    const DB = await db(env);
    // Replies from a personal invite link are stored against that invite, whatever name is typed.
    const guest = body.invite ? await findGuest(DB, body.invite) : null;
    const key = guest ? inviteKey(guest.code) : nameKey(name);
    const maxGuests = guest ? Math.max(guest.max_guests, 1) : 10;
    const guests = attending ? Math.min(Math.max(parseInt(body.guests, 10) || 1, 1), maxGuests) : 0;

    const statements = [];
    // Replying from an invite link after an earlier reply on the plain site under the same name:
    // keep only the invite-linked one.
    if (guest) {
      statements.push(DB.prepare('DELETE FROM guest_rsvps WHERE name_key = ?').bind(nameKey(name)));
    }
    // Same device replied before (without an invite link) under a differently written name:
    // drop that older reply. Invite-linked replies are never removed this way, so one phone
    // can reply for several households.
    if (token) {
      statements.push(
        DB.prepare(
          "DELETE FROM guest_rsvps WHERE token = ? AND name_key <> ? AND name_key NOT LIKE 'invite:%'"
        ).bind(token, key)
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
