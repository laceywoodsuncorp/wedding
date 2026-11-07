# Lacey & Lachlan: wedding website

The wedding site, hosted on **Cloudflare Pages**. RSVPs are saved to a
**Cloudflare D1** database, and you can read them on a password-protected page.

## How it fits together

| Path | What it does |
| --- | --- |
| `public/index.html` | The website itself. |
| `public/invite-preview.jpg` | The invitation card shown as the link preview when the site is shared in a message. |
| `functions/index.js`, `functions/i/[code].js` | Serve the site with link-preview tags. `/i/CODE` is a guest's personal invite link: it greets them by name and links their RSVP to the guest list. |
| `functions/admin/guests.js` | Guest list changes from the admin page, and `GET /admin/guests` downloads the guest list as CSV. |
| `functions/api/rsvp.js` | `POST /api/rsvp`. The RSVP form sends each reply here and it's saved to the database. |
| `functions/admin/index.js` | `/admin` is a password-protected page with the guest list, send buttons and every reply, with totals. |
| `functions/admin/export.js` | `/admin/export` downloads all replies as a CSV file you can open in Excel or Google Sheets. |
| `lib/db.js` | Shared database and password helpers. The table is created automatically on first use. |

**One reply per guest.** Guests are matched by name (ignoring capitals and extra spaces),
and also by a random ID saved on their device, so if someone replies again, even
under a slightly different name, their new reply replaces the old one. A returning guest
sees their saved reply pre-filled and can update it.

**Deadline.** RSVPs close at the end of **31 July 2027** (Queensland time). After that
the form is replaced with a "RSVPs closed" message and the server refuses new replies.
To change the date, edit `RSVP_CLOSES` in both `lib/db.js` and `public/index.html`,
and the "by 31 July 2027" text in `public/index.html`.

## One-time setup in Cloudflare

1. **Create the database:** Cloudflare dashboard → **Storage & Databases → D1** →
   **Create database**. Name it `wedding-rsvp`.
2. **Create the site:** **Workers & Pages → Create → Pages → Connect to Git** and
   pick this repository.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
3. **Connect the database:** open the Pages project → **Settings → Bindings → Add → D1 database**.
   - Variable name: `DB` (exactly this)
   - Database: `wedding-rsvp`
   - Add it for both **Production** and **Preview**.
4. **Set your admin password:** **Settings → Variables and Secrets → Add**.
   - Type: **Secret**, name: `ADMIN_PASSWORD`, value: a password of your choice.
5. **Redeploy** (Deployments → ⋯ → Retry deployment) so the binding and secret take effect.

## Guest list and sending invitations

On `/admin`:

1. **Add guests** one at a time, or paste many at once from a spreadsheet
   (one invite per line: `name, mobile, email, number of guests`).
   "Name on invite" is how they're greeted, e.g. *Jo & Sam* or *The Nguyens*.
2. **Send**: each guest has **Text**, **WhatsApp**, **Email** and **Copy message** buttons.
   They open your own messaging app with the invitation already written and their personal
   link included; you just press send. Best done from your phone. Clicking one marks the invite as sent.
3. **Track**: each guest's status shows *Not sent yet*, *Invite sent*, *Coming*, or *Can't come*.

The wording of the message can be changed under **Edit the invitation message**
(`{name}` and `{link}` are filled in for each guest).

When a guest opens their link they see "Dear Jo & Sam, we're getting married…", their name is
pre-filled in the RSVP form, the guest count is limited to the number you invited, and they can
see and change their reply from any device.

## Reading responses

- Go to `https://<your-site>/admin`. When the browser asks for a login, enter any
  username and your `ADMIN_PASSWORD`.
- Click **Download as spreadsheet (CSV)** for a file version.
- Each guest appears once, with their latest reply.
- You can also query the data in the dashboard: **D1 → wedding-rsvp → Console**, e.g.
  `SELECT * FROM guest_rsvps ORDER BY updated_at DESC;`

## Local preview

```sh
npx wrangler pages dev public --d1 DB=local --binding ADMIN_PASSWORD=test
```

Then open http://localhost:8788 (admin at http://localhost:8788/admin, password `test`).
