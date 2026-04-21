# AGENTS.md

## Project overview

Climate Solutions Scavenger Hunt (climatehunt.org) — a mobile-first Progressive Web App that challenges users to find and photograph real-world climate solutions in their area. Users pick from multiple scavenger hunts, get a random daily challenge, take photos, and share to social media.

**No backend.** Purely static files served from Cloudflare Pages. No build step, no bundler, no framework — vanilla JS, vanilla CSS, static HTML. This is intentional and should stay this way.

## Architecture

```
index.html              Single-page app shell, three tabs: Today / All Challenges / About
js/app.js               All application logic in a single IIFE
js/js-yaml.min.js       Vendored js-yaml 4.1.0 for client-side YAML parsing
css/app.css             All app styles (mobile-first, CSS custom properties)
css/styles.css          Legacy Bootstrap styles (unused by the app, kept for now)
sw.js                   Service worker — cache-first for shell, network-first for data/*.yaml
manifest.json           PWA manifest
data/index.yaml         Hunt registry — lists available scavenger hunts
data/<hunt-id>.yaml     Individual hunt definitions (categories, items, hints, descriptions)
assets/img/             Icons and images (windmill.png is the app icon)
```

### Data flow

1. App loads `data/index.yaml` to get list of available hunts
2. Hunt is selected via `?hunt=<id>` URL param, localStorage, auto-select (if only one), or user picker
3. Selected hunt's YAML file is fetched and parsed with js-yaml
4. A random incomplete item becomes the daily challenge
5. Progress is stored in localStorage keyed per hunt: `climatehunt-progress-<hunt-id>`
6. Photos are resized client-side (canvas), stored as data URLs (thumbnails) and in-memory blobs (sharing)

### Key design constraints

- **Web Share API** is used for sharing. Text sharing is reliable; file sharing works on Chrome Android but is unreliable on other platforms. The Save button (photo download) only appears on Firefox as a workaround.
- **Camera access** uses `<input type="file" accept="image/*" capture="environment">` for camera, and without `capture` for gallery. Two separate buttons because no single input reliably offers both on Android Chrome.
- **No auto-complete on photo capture.** Taking a photo should NOT mark the item complete — the user explicitly taps "Mark Complete." This prevents the challenge card from immediately switching away before the user can see their photo or share it.

## Adding a new scavenger hunt

1. Create `data/<hunt-id>.yaml` following the structure of existing hunt files
2. Add an entry to `data/index.yaml` with id, name, description, and file reference
3. Bump the cache version in `sw.js` (e.g., `climatehunt-v3` → `climatehunt-v4`)

### Hunt YAML format

```yaml
hashtag: "#climatehunt"
shareMessage: "\n\nJoin the hunt at climatehunt.org"

categories:
  - name: Category Name
    items:
      - id: unique-kebab-case-id
        title: Human-Readable Title
        description: >
          Folded block scalar for multi-line descriptions.
          Wrap at ~100 columns for readability.
        hint: "Optional hint text, can include URLs"
        bonus: false
```

- `id` must be unique across the entire hunt file
- `description` is optional but recommended; use YAML folded block scalars (`>`)
- `hint` is optional; URLs in hints are auto-linkified in the UI
- `bonus: true` items get a special badge

## Code style

- Vanilla ES5-compatible JavaScript (no modules, no const/let in new code — use var)
- All app logic lives in a single IIFE in `js/app.js`
- No build tools, no transpilation, no npm
- CSS custom properties defined in `:root` in `css/app.css`
- Color scheme: primary `#1D809F`, secondary `#ecb807`
- Mobile-first CSS, desktop adjustments via `@media (min-width: 768px)`

## Deployment

Hosted on **Cloudflare Pages**. No build command needed — it serves static files directly.

- `main` branch deploys to `climatehunt.org`
- `test` branch deploys to `test.climatehunt.pages.dev` for preview testing
- PWA features (service worker, Add to Home Screen) require HTTPS, so always test on the Cloudflare preview URL rather than localhost

### Service worker

`sw.js` uses a versioned cache name (e.g., `climatehunt-v3`). When changing cached resources:
1. Bump the version string in `CACHE_NAME`
2. Old caches are automatically purged on activation

Strategy:
- **Cache-first** for the app shell (HTML, CSS, JS, manifest, icon)
- **Network-first with cache fallback** for all `data/*.yaml` files

## Testing

No automated test suite. Testing is manual on actual mobile devices via the Cloudflare Pages preview deploy:

1. Push to `test` branch
2. Open `test.climatehunt.pages.dev` on phone
3. Verify: hunt picker shows when multiple hunts exist, challenge card renders, photo capture works, share sends text (and file on Chrome Android), progress persists across reload, skip rotates challenges, reset clears progress for current hunt only

## Security considerations

- No user input is sent to any server — all data stays in localStorage
- `escHtml()` is used for all user-visible dynamic text to prevent XSS
- Hints containing URLs are linkified with a regex; links get `target="_blank" rel="noopener"`
- Photos are stored as base64 data URLs in localStorage — large photo libraries can hit the ~5MB quota; the app handles `QuotaExceededError` by evicting the oldest photo

## Known limitations

- Firefox on Android does not support Web Share API file sharing — users must use the Save button to download photos, then manually attach in their social media app
- `<input capture="environment">` behavior varies across browsers and OS versions
- localStorage is per-origin and not shared across devices
- Service worker cache must be manually versioned when static assets change
