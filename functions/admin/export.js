// GET /admin/export — password-protected CSV download (opens in Excel / Google Sheets).
import { allRsvps, checkAdmin } from '../../lib/db.js';
import { csvCell as cell } from '../../lib/csv.js';

const COLS = ['updated_at', 'first_replied_at', 'name', 'attending', 'guests', 'dietary', 'camping', 'song', 'note'];

export async function onRequestGet({ request, env }) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;

  const rows = await allRsvps(env);
  const lines = [COLS.join(',')];
  for (const r of rows) {
    lines.push(
      COLS.map((c) =>
        cell(c === 'attending' || c === 'camping' ? (r[c] ? 'Yes' : 'No') : r[c])
      ).join(',')
    );
  }
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rsvps.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
