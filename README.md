# Wedding Website

A static wedding website, ready to deploy on Netlify (or any static host).

## Structure

| File | Purpose |
| --- | --- |
| `index.html` | Starter home page with sections for story, details, travel, registry and RSVP. Replace the placeholder text. |
| `styles.css` | Site styles (supports light and dark mode). |
| `_redirects` | Netlify redirect rules. |

## Redirects

`_redirects` currently contains:

```
/    /index_updated_abc_emergency_map.html   200
```

This rewrites the home page to `index_updated_abc_emergency_map.html`. That file is
not in the repo yet — add it to the repo root if it's meant to be your home page.
While `index.html` exists, Netlify serves it at `/` and this rule has no effect
(Netlify skips non-forced rules when a file already exists at the path).
Add `!` after `200` to force the rewrite, or delete the line if it isn't needed.

## Deploying on Netlify

1. In Netlify, choose **Add new site → Import an existing project** and pick this repository.
2. Leave the build command empty and set the publish directory to `/` (the repo root).
3. Deploy. Every push to the default branch redeploys the site.

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.
