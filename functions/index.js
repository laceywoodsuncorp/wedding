// GET / : the site, with link-preview tags.
import { renderSite } from '../lib/page.js';
export const onRequestGet = (ctx) => renderSite(ctx);
