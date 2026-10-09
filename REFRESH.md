# Keeping Station Points current

The app serves a static source snapshot. Visitors never trigger retailer searches. We considered live requests from each visitor versus a cached refresh job. The cached job reduces load, works without a retailer API key, preserves source dates and makes the published result reproducible. A source failure does not certify old facts again.

## One refresh command

Run from this directory with Python 3.12+ and Node 22+:

```powershell
python scripts/refresh.py
```

The adapters use only Python's standard library. The first import is slower; subsequent runs use `.source-cache/`, source-specific TTLs and HTTP conditional requests. No embeddings are rebuilt when a flyer changes: flyer dates are deterministic fields, separate from the model's point-notice corpus. Use `python scripts/refresh.py --offline` to rebuild and verify from cache; it cannot change source check dates.

| Data | Refresh TTL | Handling |
| --- | --- | --- |
| Branch flyer metadata | 24 hours | Titles, source links and dates only; no copied flyer images. Hide after expiry or 3 days without a check. |
| Retailer directories / branch details | 7 days | Re-import official address, hours, coordinates, status and card flags where exposed. One failed chain retains its last snapshot. |
| Point terms | 7 days | Compare normalized content hashes; changed sources require review. Suppress rates/matches after changes, fetch failures or 14 days without checking. |
| Station coordinates | 30 days | HeartRails Express; railway operator lists establish station names and route membership. |

Life uses its public structured directory and explicit branch card flags. My Basket exposes coordinates in branch pages. Welcia exposes a public store-list JSON endpoint used by its directory; only the Welcia brand is imported, not adjacent group brands with different terms. OK, Sanwa, FUJI and SEIYU expose maps on branch pages. Tokyu/Sanwa publisher flyer feeds additionally expose locations. Approximate map centers are labeled. The job waits at least 350 ms between requests to a host. Cold weekly imports make hundreds of requests; daily runs mainly fetch flyer metadata. Keep the cache between runs.

## Review changed point terms

Open URLs listed in `data/rule-status.json`. Check earning, redemption, payment restrictions, eligible branches, dates and product exclusions. Edit the displayed summaries / `src/rules.mjs` / authored notices only when supported by the new source. Then accept that chain's new baseline:

```powershell
python scripts/refresh_rules.py --approve life
python scripts/refresh.py --offline
node --test tests/rules.test.mjs tests/data.test.mjs
```

`--approve` is a maintainer assertion that a source was reviewed, not an automatic inference. HTML source changes may be unrelated to a rate change; that still needs review before resuming claims. Do not automatically approve every changed hash.

## Model and domain boundaries

A Branch has a stable provider ID, source URL, source check time, address, hours and optional coordinates. StationAssociation stores distance and published walking time separately; one branch can serve multiple stations without duplicating its source facts. Flyer has branch scope, dates, source URL, check time and either an advertised period or publication period. PointRule is a reviewed chain summary with a content-hash review state. Membership selection does not imply payment eligibility. Flyer availability does not establish an item discount or stock level.

`scripts/compile-research.mjs` joins these into `data/researched.mjs`, then the static build. It is deterministic for the same source snapshots. `data/refresh-health.json` records attempts separately from source freshness. `dist/data-status.html` exposes coverage, source checks and review states. Older manually researched pilot branches retain their own provenance and original check dates.

## Efficient scheduling and publishing

Recommended schedule: daily at 06:00 JST, keeping the cache. The TTLs automatically make directory/rule refreshes weekly and coordinates monthly. A second refresh should not download recently checked pages. Scheduling is **not enabled**. `scripts/run-refresh.ps1` is a Task Scheduler-ready local runner with logging and an exclusive lock; configure a daily task to run it with the project's absolute path. This updates local data and `dist` only.

Publishing is a separate authenticated Sites step: review changed facts, run browser checks, commit the exact source, then use the existing private Site workflow. A local scheduled run does not update the deployed Site by itself. An authenticated Codex daily automation could perform that final step, but none has been created. No credentials are stored in the refresh job.

## Limits

This is a sourced directory sample, not a complete census. Every selected station currently has at least five candidates within 2.5 km or explicit official station access; some require a longer walk. Branch hours can contain department or temporary notices: use the official page to resolve them. FUJI's point program is not yet represented; no V POINT affiliation is inferred from an old logo. Item-level pricing across all stores remains uncollected: the app shows dated original flyers and verified point/discount conditions, with one previously checked OK price example. Reliable item-price extraction would need source access and human/OCR validation, unit/pack normalization, branch scope and its own evaluation.

The [DEV article on keeping RAG indexes fresh](https://dev.to/promptcloud_services/scraping-for-rag-keeping-your-retrieval-index-fresh-and-why-staleness-hallucinates-3km8) informed separate TTLs, content hashes and source check dates. It is practitioner advice, not evidence that this project's adapters are correct; fixtures, replay checks and browser verification provide that evidence.
