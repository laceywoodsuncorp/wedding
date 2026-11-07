// GET /i/CODE : a guest's personal invitation link. Shows the site greeting them by name,
// with the RSVP form linked to their invite.
import { renderSite } from '../../lib/page.js';
export const onRequestGet = (ctx) => renderSite(ctx, String(ctx.params.code || ''));
