# Worth the Walk? — architecture contract

Worth the Walk? turns the flyers in your mailbox into a walk around your neighbourhood. This file is the contract between the browser app, the Node server and the Mastra agent layer. Pure rules live in `src/` and run in both the browser and Node.

## Modules

| Path | Runs in | Owns |
|---|---|---|
| `src/rules.mjs` | both | Station Points point-card rules and Japan dates (existing) |
| `src/walks.mjs` | both | distances, opening hours, neighbours, stop order, outing plan, Maps link, estimates, grocery stop |
| `src/mailbox.mjs` | both | `Tile`/`Flyer` shapes, JSON repair, page grouping, buckets, `needsDetail`, reading precedence, deadlines, printed savings, chain matching, TabPFN feature rows |
| `agent/` | Node | Mastra agents and workflows, model providers, tools (GSI, SerpApi, TabPFN MCP), Sentry exporter |
| `scripts/serve.mjs` | Node | static files from `dist/` + `/api/*` |
| `dist/index.html`, `dist/chirashi.mjs` | browser | the phone app (scan → mailbox → walk → stamps → dashboard → history) |
| `dist/shops.html`, `dist/app.mjs` | browser | the original Station Points directory (unchanged) |

## HTTP API

All responses are JSON unless stated. Errors: `{error: string}` with 4xx/5xx. Request bodies over the limit → 413. Per-IP limits: 240 image reads, 60 merges, 30 lookups and 30 rankings per hour (429 with `retryAfter`). A whole-page read counts as one image; its optional detail pass counts as six. The shared call queue caps upstream calls at ten and gives merges priority. Reads and merges retain hedged calls and JSON repair.

## Adaptive reading flow

1. On the phone, crop and rotate each page, resize its long side to at most 2048 px, and encode JPEG at quality 0.85. Keep pending prepared photos in IndexedDB on that phone.
2. Send one whole-page image to `/api/read-page` with `mode:'page'`. The server uses `PAGE_PROMPT` and streams the same `Tile` schema used for close-ups.
3. Save the whole-page reading, group pages and merge immediately. Show the flyer card as soon as its merge finishes. Pages without price detail show `Read ✓` after the page read.
4. The phone calls `needsDetail(tile)`. Detail is needed only when `bucketOf(tile)` is `walk`, the category is supermarket, drugstore, cleaning, restaurant or shop, and there are at least two items or printed text suggests a price list, such as a menu, a price-table label or at least three yen amounts. Home, keep and toss pages never get detail; lessons, fitness, clinics and events never get detail.
5. When needed, show `Reading prices…` on the card and send six close-ups with `mode:'tiles'`: the existing 2×3 grid, transposed for landscape, with 10% overlap. The server uses `TILE_PROMPT`. Reading progress counts one call per page plus only the six-call detail passes that the code actually selects. A detail row shows, for example, `Page 3 · read · checking prices (2 of 6)`.
6. Save readings as `[wholePageReading, ...tileReadings]` and set `detailed:true`. Merge again using the same flyer ID and position. The whole-page reading retains business, phones and address; detailed readings replace preliminary price-list items and deduplicate overlaps. This applies to model merges and deterministic fallback merges. A failed detail read leaves the preliminary card and the phone's pending photo available for retry. Reload resumes the detail pass without repeating a successful whole-page read. Failed merges remain retryable even when the preliminary card already exists.

At most three pages are processed concurrently. Completed readings merge through a serialized browser queue while other pages continue reading. Prepared photos are deleted from IndexedDB only after all needed image reads are saved. Personal mail still discards its extracted text and retains only `storable()` metadata. Images are never stored on the server.

### `GET /api/config`
`{mode: 'cloud'|'local'|'mock', model: string, features: {serpapi: bool, tabpfn: bool, sentry: bool}}`

### `POST /api/read-page` (body ≤ 12 MB)
Request: `{pageId: string, tiles: string[], mode?: 'page'|'tiles'}`. `page` requires exactly one image; omitted mode defaults to `tiles` for existing callers. Each image is a `data:image/jpeg;base64,…` or `data:image/png;base64,…` URL, ≤ 2 MB, max 9 images.
Response: **NDJSON stream** (`application/x-ndjson`), one line per event, in completion order:
- `{type:'tile', index, tile: Tile}`
- `{type:'tile-error', index, message}`
- `{type:'done', pageId, tiles: (Tile|null)[]}` in tile order (last line)

One Mastra workflow run (`readPage`) per request = one trace. Images are never written to disk or logged.

### `POST /api/merge` (body ≤ 1 MB)
Request: `{flyerId, pages: [{id, tiles: (Tile|null)[], detailed?: boolean}], scanDate: 'YYYY-MM-DD', home: {stationId, lat, lon} | null}`. `detailed` defaults to false. When true, the first reading is the whole page and the remaining readings supply exact items. Null slots preserve ordering for failed reads.
Response: `{flyer: Flyer}`, where `Flyer` is `finalizeFlyer(...)` output plus `location: {lat, lon, source: 'gsi'|'serpapi', precision, place?}` or `location: null`.
Workflow `mergeFlyer`: model merge (text only) → `normalize` → fallback `mergeFallback` if the model output is unusable → `finalizeFlyer(…, matchChain)` → locate:
1. printed address → GSI (`https://msearch.gsi.go.jp/address-search/AddressSearch?q=`), first result.
2. otherwise, if `SERPAPI_API_KEY` is set and the flyer has a business name: SerpApi `engine=google_maps`, `q=<name>`, `ll=@<home lat>,<home lon>,14z`, first local result → `place: {title, address, rating, reviews, hours, phone, phoneMatches}`; `phoneMatches` = `phoneKey(place.phone) === phoneKey(any flyer phone)`.
Personal mail (`bucket === 'keep'`) skips locate and returns `storable(flyer)` only.

### `GET /api/locate?q=&name=&phone=&lat=&lon=`
Manual retry of the same locate logic for a user-typed address or name → `{location}` or `{location: null}`.

### `POST /api/rank` (body ≤ 256 KB)
Request: `{train: [{row: number[], label: 0|1}], predict: [{id, row: number[]}]}`; rows follow `FEATURES` in `src/mailbox.mjs` (numbers only).
Response: `{model: 'tabpfn'|'rules', scores: [{id, p}]}`. TabPFN is used when `PRIOR_LABS_MCP_TOKEN` is set, `train` has ≥ 6 rows and both labels; otherwise `rules` (p from a fixed heuristic).

## Phone UI and storage

The phone has one flow: snap → answer → walk. No tabs, ratings, stop checkboxes or separate planning step. The header opens Settings and Your stamps. Settings is a native dialog on first run and from the gear; it saves line, home station and 20/40/60/90-minute length. Weight is under More.

Snap shows camera/photo inputs, a horizontal prepared-page strip with rotate/remove targets and a fixed Read N flyers action. A compact progress bar uses page counts and an estimated remaining time; underlying progress still accounts for whole-page and selected detail calls. Stops appear incrementally before reading finishes. Stop aborts the existing workers. Pending-page recovery offers Resume and Discard after reload.

The answer automatically uses eligible ranked candidates, with recognizable page stacks, English kind first, business name, best printed deal and walking/deadline information. Missing locations have inline address lookup. Not for me hides a stop and records label 0; a stamp records label 1. Six non-private labels with both classes still trigger the existing rank API. Only a returned TabPFN model adds the muted ordering attribution. The existing planner automatically computes the summary, train starts and dropped stops; 60/90-minute actions extend the budget. One optional grocery toggle and Start the walk complete the answer. Home deals, recycling and private letters open three collapsed sheet rows. Private letters expose only their count.

Native flyer/page/stamps dialogs preserve focus on close or Escape. A nested sheet returns to its parent and restores its scroll position and invoking control. Flyer details contain instructions, five current offers, five items sorted by printed saving, Show all, and the multi-flyer warning. The page sheet shows the page preview and its own reading, then thumbnail radio choices for the current flyer, any other non-private flyer, or a separate flyer. Apply writes overrides and uses the existing serialized re-merge. Matching existing flyer IDs requires equal page membership, not merely equal page counts, so moving a page cannot reuse another flyer's ID by accident.

Walk mode replaces home content and displays one stop at a time, the remaining Maps route and a single GPS reading for I'm here. A distant reading offers keep walking or Stamp anyway. Verified and self-reported stamps retain their existing solid/outline distinction. The arrival animation is instant with reduced motion. Used-offer/item chips store source indices and count only printed values through the existing savings function. Next or Skip saves the cursor; the final stop completes the walk and opens its summary. Reload restores an active walk or the latest completed summary. Your stamps combines non-zero totals, stamps, past walks and searchable non-private flyers. Distance, steps and kcal remain estimates.

### Text state (localStorage['worth-the-walk-v1'])

Saved after every change; the version-1 text contract remains readable:

```
{ version: 1,
  settings: {lineId, home: stationId|null, maxMinutes: 40, weightKg: 60},
  pages:    {[pageId]: {id, scannedAt, tiles: (Tile|null)[], detailed?, detailPending?, needsMerge?}},
  overrides:{[pageId]: groupLabel},
  flyers:   [Flyer], // storable() only; private mail has only id/pageIds/bucket/category
  labels:   {[flyerId]: 1|0}, // stamped / Not for me; no explicit ratings
  outings:  [{id, createdAt, start, end, stopIds, meters, minutes, mode,
              status: 'planned'|'active'|'done', cursor: 0, skipped: [stopId],
              stamps: [{stopId, at, kind: 'gps'|'self', distance}],
              used:   [{flyerId, kind: 'offer'|'item', index}]}] }
```

Personal mail deletes page readings and overrides. No image data, Blob or object URL is written to localStorage. Legacy shopping-list controls are removed.

### Phone-only photos (IndexedDB)

Database worth-the-walk-photos is version 2. Its upgrade preserves pages (keyPath pageId) and creates thumbs (keyPath pageId). pages retains prepared JPEG blobs, rotation/status and addedAt until all required readings save successfully. It continues to support reload and partial-detail recovery.

After crop/rotation, the phone also creates a JPEG thumbnail, long side at most 480 px, quality 0.7. thumbs stores {pageId, blob}. Full prepared photos are deleted after reading; thumbnails stay for visual identification, grouping and history. When a flyer is personal mail (keep), its thumbnails are deleted immediately from memory and IndexedDB; startup also cleans any private thumbnails left after an interrupted session. Removing an unread selected page or discarding it deletes its thumbnail. With IndexedDB unavailable, displays use a neutral placeholder and reading uses the existing memory fallback.

Thumbnail Blobs load from IndexedDB into memory and get display-only object URLs. Every re-render, including search, and pagehide revokes them. There are no external image assets, accounts or server image storage. The footer states: "Photos stay on this phone. They're only sent to be read." Mock mode adds tiny Demo mode footer text.

## Model prompts (agent/prompts.mjs)
- **Page:** one whole-page image → the same compact JSON schema and printed-text rules as `Tile`. Read business identity, category, headline phones, address and main offer. Describe an unreadable dense price list in the summary so the code can request close-ups; omit unreadable items. Omit empty keys.
- **Tile:** one image of part of one page → JSON matching `Tile`. Rules: report only printed text; translate names/offers to short English; keep addresses, phones, dates exactly as printed; `category` from the fixed list; `comes_to_you` for 出張/訪問/伺います services; `delivery` for 宅配/デリバリー/お届け; `items` only when the tile shows a product price list; money as numbers; unknown → null.
- **Merge:** the tiles of all pages of one flyer → one `Flyer` JSON. Rules: use only the given tiles; one `summary_en` (≤ 120 characters) saying what it is and what's offered; keep `page` on each offer and item; never invent prices, dates or addresses.

## Environment
`GRADIENT_MODEL_ACCESS_KEY` (DigitalOcean), `GRADIENT_MODEL` (default `gemma-4-31B-it`), `LOCAL_LLM=1` + `LOCAL_LLM_MODEL` (Ollama), `MOCK_GEMMA=1` (fixtures, for tests), `SERPAPI_API_KEY`, `PRIOR_LABS_MCP_TOKEN`, `SENTRY_DSN`, `HOST` (default 127.0.0.1; Render: 0.0.0.0), `PORT` (default 4175).
