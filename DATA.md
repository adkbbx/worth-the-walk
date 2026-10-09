# Data provenance

All branch facts and point rules were checked on **9 October 2026**. Branch URLs are recorded per store in `data/catalog.mjs`. Each notice paraphrase has its own official source URL in `data/notices.json`.

## Sources and boundaries

| Fact | Official source | Interpretation |
| --- | --- | --- |
| My Basket WAON bonus dates | [Point service](https://www.mybasket.co.jp/service/point/) | Greater Tokyo: 20th/30th = 5 points per ¥200 including tax; 5th/15th/25th = 2. Eligible payments and exclusions apply. |
| My Basket payment/redemption exclusions | [FAQ](https://www.mybasket.co.jp/faq/) | Other credit cards do not earn WAON POINT. Register to redeem. Electronic WAON points need conversion. AEON 5% discount does not apply. |
| OK Club discount | [OK Club](https://ok-corporation.jp/feature/okclub.html) | Present membership and pay cash. Eligible reduced-tax food price × 3/103; alcohol and other exclusions apply. Not a point balance. |
| OK advertised item | [Kanto flyer PDF](https://ok-corporation.jp/media-download/1737/fdd79ce358b2e6ea/PDF/) via [flyer directory](https://ok-corporation.jp/flyer/) | 5–11 Oct 2026. AJINOMOTO vegetable chūka-don topping 200g × 2: nonmember ¥368 before tax, member cash ¥358 before tax. Does not establish stock or price superiority. Directory excludes Kiyose; these two pilot OK branches are not Kiyose. |
| SEIYU Rakuten service | [1 Oct 2026 notice](https://www.seiyu.co.jp/assets/images/RakutenPoints_ServiceEnd_261001.pdf) | 1 point per ¥200 before tax, redeem 1 point as ¥1. Last card-service day 4 Apr 2027. Related campaigns end on their own dates, no later than 31 Dec 2026. |
| Tokyu Store earning | [FAQ](https://www.tokyu-store.co.jp/contact/faq.html) | Present point card before checkout. 1 point per ¥200 before tax. Do not claim program stacking or redemption terms not yet checked. |
| Kitchen Court earning/redemption | [Point service](https://www.keiostore.co.jp/service/point.html) | Keio and Rakuten earning; 1 point per ¥200 before tax for each. Non-Keio credit cards exclude Keio earning. Spend 1 point as ¥1; cannot redeem both programs in one payment. |

Walk times are official branch estimates from the named station, not measured routes. Unknown station walk times are `null` and sorted last. Google Maps handles walking directions. There is no location permission or synthetic map.

Hours refer to grocery floors where the branch page distinguishes floors. After-midnight closing is labelled with the following day. Special-day changes are not modeled. Missing support means “not verified,” not “not accepted.”

## Updating a snapshot

1. Recheck the official branch and program sources.
2. Record changed facts, effective dates, scope and exclusions. Never confuse publication with effective date.
3. Update the snapshot date only after rechecking the included facts. Changing the date alone does not refresh data.
4. Update notice paraphrases and regenerate the embedding index.
5. Add independent questions before inspecting the new model rankings.
6. Run rule and browser checks. Keep failures in the evaluation report.

There is no automated scraper or background refresh in this version. All notice texts are project-authored paraphrases rather than a republication of full retailer text. The local downloaded flyer is ignored and must not be committed.
