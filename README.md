# Worth the Walk?

Photograph the flyers in your mailbox, read what each one is in English, and plan a walk from where you are (or a station you pick) to the places worth visiting. Each stop gives you an ink stamp.

No Japanese flyers to hand? Open the app and tap **Try a sample mailbox**: eight made-up flyers, placed around your start, with no model calls.

**Install and offline:** Worth the Walk? is installable on your phone. After an online visit, the app shell is cached network-first so a walk in progress reopens without signal, with your saved walk and stamps intact. Reading flyers still needs a connection.

## How it works

1. Photograph the pages. Gemma 4 reads each page whole first (one call), so its card appears within seconds. Only walkable price lists (supermarkets, drugstores, cleaners, menus) get a second pass in six overlapping tiles for exact prices.
2. The app groups pages from the same flyer (shared phone number, website, or name and address), merges the readings, and gives each flyer a short English summary.
3. The answer is a ticket: the places **worth a walk**, in order, each with its best printed price. The rest of the pile goes to a tray: **Home** (deals to use at home), **Recycle** (safe to throw away), and **Keep** (personal or official mail; nothing from it is stored). Tap a page to correct its group.
4. The first time it needs a start, the app asks once: **Use my location** or **Pick a station**. Tap ✕ on any place you don't want. TabPFN learns from your ✕ and your stamps; simple rules take over when there are too few labels or a prediction fails.
5. **Start the walk** turns the screen into a train-door display. At each stop, one GPS reading checked on the phone gives you an ink stamp; without GPS you get a dashed, self-reported stamp. Mark the offers you used. Savings count only values printed on the flyer.

## Why open models

Mail photos can contain personal information. Open models let you choose where image inference runs. Cloud mode sends tiles to DigitalOcean; `LOCAL_LLM=1` switches image reading and text merging to Ollama on your computer. Local mode alone does not turn off the optional lookup, ranking or tracing services; see "Run it on open pieces only" below.

The cloud check recorded about **$0.00044 per tile** in Sentry's cost attributes. Six tiles cost roughly a quarter of a cent per flyer page. This is an observed tile-reading cost, not a fixed price or a total that includes merging and retries.

The model comparison matters because the smaller local model was poor at reading these flyers.

| Model | Checked input | Result |
| --- | --- | --- |
| Gemma 4 31B on DigitalOcean serverless inference | One cropped flyer section, through a Mastra agent | 4/4 product names and member and non-member prices correct in about 10 seconds |
| Gemma 4 31B | Full flyer page | Read poorly; the app uses tiles instead |
| Gemma 4 E2B through Ollama | Full page, then a tile | 0/8 on the page; 2/4 on the tile |

Local mode warns you to check every price. These small checks do not establish accuracy across real mailbox flyers. Price-list pages are then read again as a 2×3 grid with 10% overlap (3×2 for landscape); on the real mailbox below, a whole-page read was enough for every service flyer (4–26 s, one call each).

### Run it on open pieces only

Gemma 4 (open weights, Apache 2.0) and Mastra (Apache 2.0) are the parts the app needs. Every hosted service around them is optional:

| Piece | Open? | Without it |
| --- | --- | --- |
| DigitalOcean serverless inference | hosted service, open model | `LOCAL_LLM=1`: Gemma 4 E2B through Ollama |
| TabPFN via Prior Labs' MCP | open-source code, hosted API | rule-based ranking |
| SerpApi | hosted service | printed addresses only, through GSI |
| Sentry | hosted service | no tracing |

```sh
ollama pull gemma4:e2b-it-qat
LOCAL_LLM=1 GRADIENT_MODEL_ACCESS_KEY= PRIOR_LABS_MCP_TOKEN= SERPAPI_API_KEY= SENTRY_DSN= npm start
```

Blank values override `.env`. Only the printed address text goes out, to Japan's GSI address search. Checked on 12 Oct 2026: a supermarket page read on a laptop in 27–40 s (rough: three prices, two without a product name), a printed address located through GSI, and ranking by rules.

## Architecture

| Module | Runs in | Responsibility |
| --- | --- | --- |
| `dist/chirashi.mjs`, `dist/index.html` | Browser | Photos, tiling, mailbox, walk, stamps, dashboard, history, and localStorage |
| `src/mailbox.mjs` | Browser and Node | Parse readings, group pages, sort buckets, extract deadlines, count printed savings, and build numeric ranking rows |
| `src/walks.mjs` | Browser and Node | Distances, opening hours, stop order, time limits, walking estimates, and Maps links |
| `agent/mastra.mjs`, `agent/models.mjs`, `agent/prompts.mjs` | Node | Mastra agents, read and merge workflows, cloud/local models, and private trace export |
| `agent/tools.mjs`, `agent/serpapi.mjs`, `agent/tabpfn.mjs` | Node | GSI address search, budgeted place lookup, and Prior Labs MCP ranking |
| `scripts/serve.mjs` | Node | Serve `dist/` and the HTTP API |
| `src/rules.mjs`, `dist/shops.html`, `dist/app.mjs` | Browser and Node | Original Station Points directory and point-card rules |

The request flow is **read-page NDJSON → group pages → merge → locate → rank → plan → stamp**.

```text
Phone photo -> whole page -> POST /api/read-page -> Gemma 4 -> needsDetail? -> six tiles (price lists only)
                              | NDJSON tile events
Phone: group pages -> POST /api/merge -> merge readings -> locate
                                                          |-- GSI: printed address
                                                          '-- SerpApi: eligible missing address
Phone: numeric rows -> POST /api/rank -> TabPFN or rules
Phone: plan walk -> one GPS reading per stamp -> localStorage
```

`/api/read-page` streams `tile` or `tile-error` events as reads finish, then a `done` event in input order. Four workers read a page with one retry per tile. A shared queue limits upstream calls to six, and the server limits each IP to 80 tile reads per hour.

The browser groups pages by printed phone, website, or business name plus address. You can split or merge groups. `/api/merge` combines the text readings, applies bucket and deadline rules, and locates the flyer. Personal or official mail skips location lookup and keeps only a minimal marker.

Ranking uses numeric features for category, distance, offer, free trial, printed value, time left, visiting services, delivery, and presence of an address. Walk planning orders stops and drops stops to fit your time limit. Distances and walking times are estimates; the route opens in Google Maps. GPS stamping uses a single reading, with a separate self-reported stamp when location is unavailable or you choose to stamp anyway.

See [the architecture contract](docs/chirashi-architecture.md), [agent runtime](agent/RUNTIME.md), and [integration notes](agent/NOTES.md) for details.

## Partner technology

| Technology | Use in this app |
| --- | --- |
| Gemma 4 | Reads Japanese flyer tiles and merges readings into an English summary. Cloud default: `gemma-4-31B-it`; local default: `gemma4:e2b-it-qat`. |
| DigitalOcean | Serverless inference for the cloud Gemma model through an OpenAI-compatible endpoint. |
| Mastra | Runs the `readPage` and `mergeFlyer` workflows and their agents. Its MCP client connects to Prior Labs. |
| TabPFN, Prior Labs MCP | Uploads numeric feature rows, fits a classifier, and predicts which flyers you would act on. No business names, addresses, or flyer text go to TabPFN. |
| SerpApi | Finds places near your start only for worth-a-walk flyers without a usable printed address. Uses a disk cache and a search-budget guard. |
| Sentry Agent Tracing | Keeps model, token, cost, and timing attributes while dropping prompts, outputs, images, and URLs with query strings. |
| Render | Hosts the Node server and static phone app using `render.yaml`. |
| GSI address search, 国土地理院 | Resolves printed Japanese addresses. Free, no API key; results can be at block precision. |

The live TabPFN check used synthetic labels. Through remote MCP's upload → fit → predict flow, it ranked a nearby free-trial flyer at **0.9996** and a far no-offer flyer at **0.0004** in **11.6 seconds**. This proves the integration on synthetic rows, not prediction quality for your choices. Fewer than six labels, only one label class, a missing token, or any failure uses simple rules.

SerpApi live searches require `SERPAPI_LIVE=1`. The cache lasts 30 days. Default limits are five searches per day and 40 per month; the Render blueprint sets eight and 180. The budget guard stops searches when the reconciled account balance reaches the 20-search reserve. Run the status check to reconcile that balance. Tests forbid real network calls.

A tile-read trace has this shape:

```text
invoke_workflow readPage
└─ workflow.step read-tiles
   └─ invoke_agent flyer-reader
      └─ chat gemma-4-31B-it
```

One page request produces one workflow trace. You can inspect timing, model usage, and cost without exporting the flyer payload.

## Savings rule

Only offers and items you mark as used enter the savings total. The app counts a printed regular price minus a printed offer price, a printed yen discount, or a printed percentage discount with a printed regular price. A free trial counts only when its regular price is printed. An item price alone does not establish savings. Offers without enough printed values remain uncounted.

## Privacy rules

- The browser shrinks each photo and sends each page once to the app server (as six tiles only for price lists), and the server discards the photos after reading. The server does not save images or mailbox records. Cloud mode forwards tiles to DigitalOcean for inference.
- Settings, extracted flyer records, labels, walks, and stamps live in the phone's localStorage. There are no accounts. Clearing browser storage removes that history.
- Personal or official mail retains only its ID, page IDs, bucket, and category. Its extracted page readings are removed from saved state.
- If you use your location as the start, it stays on the phone; the server only ever receives the start rounded to two decimals (about 1 km). GSI receives a printed or manually entered address. SerpApi receives a business name and that rounded start. Its server-side cache stores sanitized public place results and a budget ledger, not mail photos.
- TabPFN receives numeric feature rows and labels. Sentry receives sanitized traces. GPS readings stay in the browser; the app saves stamp time, type, and distance rather than a GPS trail.
- Opening a walking route sends the route locations to Google Maps.

## Run it

Use Node.js 22 and install dependencies:

```sh
npm ci
```

Create a root `.env` file and copy the keys you need into it:

```dotenv
GRADIENT_MODEL_ACCESS_KEY=your_digitalocean_inference_key
SERPAPI_API_KEY=your_serpapi_key
PRIOR_LABS_MCP_TOKEN=your_prior_labs_token
SENTRY_DSN=your_sentry_dsn
```

Omit optional keys for services you do not use. Keep real keys out of version control. Shell environment variables override `.env`.

| Variable | If missing |
| --- | --- |
| `GRADIENT_MODEL_ACCESS_KEY` | Cloud mode cannot start unless the alias `DIGITALOCEAN_INFERENCE_KEY` is set. Local and mock modes need neither key. |
| `GRADIENT_MODEL` | Uses `gemma-4-31B-it`. |
| `LOCAL_LLM` | Uses cloud mode. Set to `1` for Ollama. |
| `LOCAL_LLM_MODEL` | Uses `gemma4:e2b-it-qat` in local mode. |
| `LOCAL_LLM_URL` | Uses `http://127.0.0.1:11434/v1` in local mode. |
| `SERPAPI_API_KEY` | Live place search is unavailable; GSI address search still works. |
| `SERPAPI_LIVE` | No live SerpApi searches. Set to `1` to enable budgeted searches. |
| `SERPAPI_DAILY_LIMIT` | Limit is five searches per day. |
| `SERPAPI_MONTHLY_LIMIT` | Limit is 40 searches per month. |
| `PRIOR_LABS_MCP_TOKEN` | Ranking uses simple rules. |
| `SENTRY_DSN` | No Sentry trace export. |
| `MOCK_GEMMA` | Uses the selected real model. `1` enables synthetic fixtures; `dev:mock` sets this for you. |
| `HOST` | Listens on `127.0.0.1`. |
| `PORT` | Listens on port `4175`. |
| `TRUST_PROXY` | Rate limits use the socket's IP. `1` trusts the last forwarded IP from the proxy. |
| `NODE_ENV` | Sentry uses the `development` environment. |

Build the assets, then start cloud mode:

```sh
node scripts/build.mjs
npm start
```

Open `http://127.0.0.1:4175`. For local mode, run Ollama with the configured model available, then start:

```sh
LOCAL_LLM=1 npm start
```

In PowerShell, use `$env:LOCAL_LLM='1'` followed by `npm start` instead. Remove that variable to return to cloud mode.

For the offline demo, use synthetic readings and locations:

```sh
npm run dev:mock
```

The integration checks are separate from the offline tests:

| Command | What it does |
| --- | --- |
| `node scripts/serpapi-check.mjs` | Prints budget status and reconciles the account balance if a key exists. Spends no searches without both `--search` and `--yes`. A search also needs `--near lat,lon`; cached results may avoid spending. |
| `node scripts/tabpfn-check.mjs` | Runs the synthetic ranking check against Prior Labs. Requires its token for a TabPFN result; exits unsuccessfully if it falls back to rules. |
| `node scripts/sentry-check.mjs` | Reads `.local-fixtures/meat.png` through cloud inference, exports a trace, and prints its ID. Requires the local fixture, a DigitalOcean inference key, and `SENTRY_DSN`. This makes a live model call. |

## Tests

```sh
npm test
npm run check:chirashi
```

`npm test` runs unit, agent, and server tests offline with fixtures and injected transports. It does not call real model or lookup services.

`npm run check:chirashi` uses Playwright and an installed Microsoft Edge. It starts its own mock server, uses a 390×844 phone viewport and a fixed clock, and checks the welcome screen, the sample mailbox (no API calls), the inline start chooser, scanning, grouping, privacy (including the rounded start), ranking requests, walks, GPS and self-reported stamps, printed savings, and persistence. It also checks desktop overflow and `/shops.html`. Screenshots go to `.impeccable/review/`. Use `TEST_BROWSER=chrome` to select installed Chrome instead.

## Deploy on Render

Create a Render Blueprint from this repository using [render.yaml](render.yaml). The blueprint selects Node 22, installs production dependencies, builds the assets, and starts the Node server. Its health check is `/api/config`.

Enter `GRADIENT_MODEL_ACCESS_KEY` for cloud inference. Enter `SERPAPI_API_KEY`, `PRIOR_LABS_MCP_TOKEN`, and `SENTRY_DSN` for the optional integrations you use. The blueprint sets `HOST=0.0.0.0`, `GRADIENT_MODEL=gemma-4-31B-it`, and enables budgeted live SerpApi searches.

`TRUST_PROXY=1` makes per-IP rate limits use the last address in Render's `X-Forwarded-For` header. Set it only behind a trusted proxy. The blueprint does not attach a persistent disk, so the SerpApi disk cache and budget ledger can reset on redeploy. Account reconciliation supplies the balance used by the reserve guard.

## Original Station Points directory

The original grocery and point-card directory remains at [`/shops.html`](dist/shops.html). It contains sourced store candidates, membership conditions, and dated offers around stations. Its data and refresh documentation stays in [DATA.md](DATA.md), [REFRESH.md](REFRESH.md), and [STATIONS.md](STATIONS.md).

## Accuracy on real mailbox flyers

One real mailbox: **7 flyers on 10 pages**, photographed on a phone (mostly sideways, on a dark floor) and sent through WhatsApp at 2048 px. Each page was cut into six tiles and read by Gemma 4 31B; the pipeline was run three times while tuning prompts. The table reports the final run on the deployed code, with notes where runs differed. Addresses and station names are deliberately left out.

| flyer type | pages | business correct | category correct | address correct | offer correct |
| --- | --- | --- | --- | --- | --- |
| Dinner delivery | 1 | ✓ | ✓ deals to use at home | no street address read | ✓ free gift for requesting info |
| Sushi delivery (front + menu back) | 2 | front ✓ in 2 of 3 runs; back ✗ (stylised logo misread) | ✓ deals to use at home (the back page alone was once sorted as walk) | ✓ (back page) | ✓ half-price coupon, 10% off, 20% off takeout, 56 menu items |
| Dry cleaner | 2 | ✓ | ✓ worth a walk | partial | ✓ printed before/after prices (shirts ¥297 → ¥98, slacks ¥987 → ¥326) |
| Pilates / yoga studio | 1 | ✓ | ✓ worth a walk | station access only | ✓ trial ¥3,300 → ¥1,000, admission ¥0 |
| Gold buyer | 2 | ✓ | ✓ safe to throw away | ✓ | ✓ contract bonus |
| Junk removal | 1 | ✓ | ✓ safe to throw away | ✓ | ✓ free estimate |
| Appliance pickup | 1 | ✓ | ✓ safe to throw away | none printed | ✓ free collection |

- **Tiles:** 60/60 read, including sideways photos.
- **Buckets and offers:** correct for all 7 flyers.
- **Grouping:** 1 of 3 two-page flyers was grouped automatically (the gold buyer, by business name). The dry cleaner split once because Gemma wrote its name in katakana on one page and in English on the other; the sushi back page has no name or phone in common with its front. Both are fixed with **Fix pages → merge**.
- **Phone numbers:** large headline numbers were missed until the prompt asked for every number; one number printed across a tile boundary is still read in two halves.
- **Time:** reading the 10 pages took 58–177 s across runs (DigitalOcean serverless latency varies); merging took 87 s once price-list items were merged by code instead of by the model (232 s before). The app shows flyers as they finish.

## License

Project code and original annotations use the [MIT license](LICENSE). Models and runtime dependencies keep their own licenses. The original directory's multilingual MiniLM base model uses Apache-2.0; its revision and file hashes are recorded in [data/model.json](data/model.json). Schibsted Grotesk fonts use the SIL Open Font License in `dist/fonts/OFL.txt`. Retailer notices, logos, and flyer images are not relicensed. Flyer images are not redistributed. Links and limited factual summaries retain source attribution.
