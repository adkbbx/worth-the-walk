# Data provenance

Branch imports and flyer checks ran on **9–10 October 2026 JST**. Each branch retains its own `checkedAt`, official URL and source hash in `data/branches-*.json`. Older pilot facts retain their original check time. Point-rule checks and review baselines are in `data/rule-status.json`. Authored notice paraphrases have official URLs in `data/notices.json`. Source refresh attempts are separate from source freshness.

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

Walk times are official branch estimates from the exact named station, not measured routes. Unknown walks are `null`; coordinate-based straight-line estimates are labeled separately. Similar names such as 高円寺 and 東高円寺 cannot share walking estimates. Publisher map centers may be approximate. Google Maps handles the actual walking route. No location permission is required. Coordinates come from [HeartRails Express](https://express.heartrails.com/api.html) and retailer-linked maps / publisher feeds; no OSM data is used in the shipped dataset.

Hours refer to grocery floors where the branch page distinguishes floors. After-midnight closing is labelled with the following day. Special-day changes are not modeled. Missing support means “not verified,” not “not accepted.”

## Station and point-program expansion

The complete operator-checked station lists are in `data/rail-lines.mjs`; [STATIONS.md](STATIONS.md) lists all 74 stations and candidate counts. There are 547 distinct branches and 1,908 station associations. Every station has at least five sourced candidates within 2.5 km direct distance or explicit station access. Up to ten distinct retailers are displayed, with additional branches expandable. Shitte is counted once, Musashi-Mizonokuchi and Mizonokuchi remain distinct, Oshiage is included, and Den-en-toshi belongs to Tokyu. This is not a census of all local shops.

Additional branch sources: [Life Shukugawara](https://store.lifecorp.jp/detail/east823/) (5-minute walk from Shukugawara, 10 from Noborito), [Life Sakura-shimmachi](https://store.lifecorp.jp/detail/east639/), [Life Mizoguchi](https://store.lifecorp.jp/detail/east648/) (10-minute walk from Takatsu), and [Welcia Takenotsuka 1-chome](https://store.welcia.co.jp/welcia/spot/detail?code=1206D). Welcia walking time and food assortment are not verified. Life’s delivery-only Sakura-shimmachi center is excluded.

[Life common-point rules](https://www.lifecorp.jp/service/point/index.html): d POINT or Ponta earn 1 per ¥200 before tax, redeem 1 as ¥1, and cannot combine with LaCuCa/LC JCB. Product exclusions apply. Life’s own multipliers do not apply, and point-paid amounts do not earn points. [LaCuCa](https://www.lifecorp.jp/service/lacuca/) earns 1 per ¥200 before tax plus 1 per ¥300 for LaCuCa e-money payment. Explicit branch card flags restrict chain defaults. [Welcia’s base-point FAQ](https://welcia.tayori.com/q/yk-01/detail/1150044/) gives V POINT 1 per ¥200 and WAON POINT 1 per ¥100 before tax. Its [20th-day FAQ](https://welcia.tayori.com/q/yk-01/detail/682253/) states that 200 or more WAON POINT buys 1.5× normal value. V POINT does not qualify; exclusions and limits apply. Only retail Welcia branches are listed, not pharmacy-only branches or different group brands.

[Sanwa / Food One terms](https://www.heartful-sanwa.co.jp/point): own card earns 1 per ¥200 before tax with eligible cash / vouchers. Cashless generally earns none, with branch exceptions. The source issues a point voucher each time cumulative points exceed 250; one voucher redeems ¥300, three redeem ¥1,000, without change. FUJI affiliation remains unverified and does not produce point matches.

The [Maruetsu termination notice](https://www.maruetsu.co.jp/wp-content/uploads/2025/12/20251218-2.pdf) ends V POINT service on 30 June 2026. No current Maruetsu V POINT match is inferred from historical affiliations. PayPay, nanaco, JRE POINT and TOBU POINT choices link to official program information; they do not imply verified branch support or uniform earning rates. Payment acceptance alone does not establish loyalty-card eligibility.

The current index contains 20 authored, reviewed notice paraphrases, including Life, Welcia and Sanwa. Its 40-query authored smoke evaluation reports 70.0% Hit@1 / 87.5% Hit@3 for MiniLM and 40.0% / 60.0% for character-bigram Jaccard. All rankings and misses are published. No independent validation is claimed. Browser results additionally filter station chains, changed/stale rules and expired item notices.

## Updating a snapshot

1. Recheck the official branch and program sources.
2. Record changed facts, effective dates, scope and exclusions. Never confuse publication with effective date.
3. Update the snapshot date only after rechecking the included facts. Changing the date alone does not refresh data.
4. Update notice paraphrases and regenerate the embedding index.
5. Add independent questions before inspecting the new model rankings.
6. Run rule and browser checks. Keep failures in the evaluation report.

The incremental adapters are runnable with `python scripts/refresh.py`; no background schedule is enabled. [REFRESH.md](REFRESH.md) specifies TTLs, conditional caching, failure preservation, review steps and publishing. There are 208 dated flyer records across 88 Life/Tokyu/Sanwa/Fresco branches. Life dates are advertised periods; Shufoo dates are publication windows and do not establish individual item-sale dates. Only minimal titles/dates/links are shipped; images and raw source HTML stay out of the repository. Freshness gating hides expired flyers and records unchecked for more than three days. Prices are not automatically read from images. Retailer/source content remains governed by its own terms; the code's MIT license does not relicense it.

The Kuji correction adds [Top Parque Kuji](https://super-tops.com/shop/kuji/) (official one-minute walk, 09:00–22:30), [New Yahiro Inadazutsumi](https://super-tops.com/shop/inadazutsumi/), and [Fresco Kuji](https://fresco-kanto.com/store/kuji/) (10:00–22:00, retailer-linked map coordinates). Top CoGCa and Fresco store-card existence are described without claiming verified earning/redemption rates or common-point support. Fresco branch facts require manual rechecking because direct automated requests are blocked; its linked flyer widget can be refreshed automatically.
