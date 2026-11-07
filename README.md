# Under the Jacarandas: wedding website

The wedding site, hosted on **Cloudflare Pages**. RSVPs are saved to a
**Cloudflare D1** database, and you can read them on a password-protected page.

## How it fits together

| Path | What it does |
| --- | --- |
| `public/index.html` | The website itself. |
| `functions/api/rsvp.js` | `POST /api/rsvp`. The RSVP form sends each reply here and it's saved to the database. |
| `functions/admin/index.js` | `/admin` is a password-protected page listing every reply, with totals (guests coming, camping). |
| `functions/admin/export.js` | `/admin/export` downloads all replies as a CSV file you can open in Excel or Google Sheets. |
| `lib/db.js` | Shared database and password helpers. The table is created automatically on first use. |

If saving a reply fails (for example, no connection), the form falls back to
showing the reply with a **Copy reply** button so the guest can send it to you directly.

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

## Reading responses

- Go to `https://<your-site>/admin`. When the browser asks for a login, enter any
  username and your `ADMIN_PASSWORD`.
- Click **Download as spreadsheet (CSV)** for a file version.
- If a guest replies more than once (the button changes to "Update my reply"), each
  reply is kept. Use the most recent one.
- You can also query the data in the dashboard: **D1 → wedding-rsvp → Console**, e.g.
  `SELECT * FROM rsvps ORDER BY created_at DESC;`

## Local preview

```sh
npx wrangler pages dev public --d1 DB=local --binding ADMIN_PASSWORD=test
```

Then open http://localhost:8788 (admin at http://localhost:8788/admin, password `test`).
