// Serves the static site with link-preview tags (so a shared link shows the invitation card)
// and, for a personal invite link, the guest's details for the greeting and RSVP form.
import { db, findGuest, inviteKey } from './db.js';

const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// JSON that is safe to place inside <script>.
const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

export async function renderSite({ request, env }, code) {
  const origin = new URL(request.url).origin;
  let invite = null;

  if (code) {
    try {
      const DB = await db(env);
      const guest = await findGuest(DB, code.toUpperCase());
      if (guest) {
        const r = await DB.prepare('SELECT * FROM guest_rsvps WHERE name_key = ?').bind(inviteKey(guest.code)).first();
        invite = {
          code: guest.code,
          name: guest.name,
          max: guest.max_guests,
          reply: r && {
            name: r.name, attending: !!r.attending, guests: r.guests, dietary: r.dietary || '',
            camping: !!r.camping, song: r.song || '', note: r.note || '',
          },
        };
      }
    } catch (err) {
      console.error('Invite lookup failed', err);
    }
  }

  const title = invite ? `${invite.name}, you’re invited` : 'Lacey & Lachlan are getting married';
  const description = 'Friday 22 October 2027, under the jacarandas at Tamborine. Tap for your invitation, the details and to RSVP.';
  const image = origin + '/invite-preview.jpg';

  const head = `
<meta name="description" content="${attr(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Under the Jacarandas">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:image" content="${attr(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Invitation: Lacey and Lachlan, Friday 22 October 2027, with a painting of a couple under a jacaranda">
<meta property="og:url" content="${attr(origin + new URL(request.url).pathname)}">
<meta name="twitter:card" content="summary_large_image">
${code ? '<meta name="robots" content="noindex">' : ''}
${invite ? `<script>window.INVITE = ${safeJson(invite)};</script>` : ''}`;

  const asset = await env.ASSETS.fetch(new URL('/', request.url));
  const res = new HTMLRewriter()
    .on('head', { element: (el) => el.append(head, { html: true }) })
    .transform(asset);
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', code ? 'private, no-store' : 'public, max-age=300');
  headers.delete('ETag');
  return new Response(res.body, { status: 200, headers });
}
