# Static landing pages

Plain HTML, no build step, no dependencies. Deployed as-is to GitHub Pages.

- `shared/base.css` — shared structure and components
- `shared/app.js` — shared runtime: analytics loading, price/copy variants by
  URL parameter, attribution capture, deposit and email wiring
- `thanks/` — post-checkout confirmation
- `support/`, `guarantee/`, `privacy/`, `terms/` — shared pages

Each page folder is one `index.html` with an inline theme and a `HKB_CONFIG`
block at the bottom that `shared/app.js` reads.

Serve locally with `python3 -m http.server 8080`.
