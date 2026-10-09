# Station Points: one station, fewer tabs, a grocery trip worth taking

Unpublished working draft for the DEV Hacktoberfest Open-Source AI Challenge, Week 1. Do not submit until repository and demo links are public and the author has reviewed this text.

## What I built

Station Points compares grocery shops around a selected Japanese train station. Choose the point cards you own, pick a visit date, and see which shops match, what payment conditions apply, and when recurring bonus days occur. Open the original flyer or walking directions when you are ready to go.

The station selector covers 74 stations, including the full JR Nambu and Tokyu Den-en-toshi lines and Tobu Skytree through Takenotsuka. Verified shop coverage is smaller: 21 physical branches across eight station areas, with 22 station-to-shop records. Only the original Koenji, Ogikubo and Kichijoji areas reach the intended 5–10-shop comparison. Other stations clearly disclose incomplete research. This is a dated snapshot, not a nationwide finder or live inventory service.

## Why this belongs in “Touch Grass”

The intended action is a short physical grocery trip. The screen helps someone choose a stop and check its conditions before leaving the station. I have not yet measured whether it reduces screen time or changes trips, and I have not completed an outdoor user test.

## The open-source AI

Japanese reward notices have overlapping terms: cash discounts, point multipliers, payment exclusions and service end dates. A multilingual MiniLM model lets someone search these notices in English or Japanese. “Cheaper food when I pay with banknotes” can retrieve the OK Club cash-discount condition.

The quantized ONNX model runs in the browser, with no inference API or account. It ranks checked Japanese paraphrases; it does not generate a shopping answer or calculate eligibility. Original notices stay linked. Dates and point conditions remain deterministic or manually verified.

## What the first evaluation actually shows

On 30 author-written questions against 14 source-reviewed Japanese paraphrases, MiniLM reached 80.0% Hit@1 and 93.3% Hit@3. Character-bigram Jaccard reached 43.3% and 63.3%. Much of the difference comes from English queries against Japanese text; on Japanese queries the lexical baseline already reached 93.3% Hit@3.

This is a smoke benchmark. The project authored both the questions and paraphrases. No independent labeling, retailer holdout, trained new model or OCR evaluation has been completed. The public report includes all rankings and first-result misses.

One important failure mode is confusing closely related bonus notices or positive and negative payment conditions. Search returns relevant notices with their conditions, not a claim that a discount applies to you.

## Details that matter at checkout

- My Basket's 20th/30th promotion gives 5× WAON points under eligible payments; it is not AEON's 5% discount.
- OK's food discount requires membership and cash; a membership alone does not qualify a credit-card payment.
- SEIYU's October announcement schedules Rakuten point-card service to end after 4 April 2027. The announcement did not end the service immediately.

These rules are linked to official sources. One advertised frozen-food price was manually verified in OK's 5–11 October flyer. Unverified item prices elsewhere remain links.

## Before submission

- Publish the MIT source repository and make the reviewed demo accessible to judges.
- Test one station trip in person and record observations without inventing product impact.
- Ask independent Japanese/English readers for new queries and labels; preserve test results separately from development data.
- Check the submission template, current challenge rules and AI disclosure requirements.
- Add the demo, repository, screenshots and model/evaluation links, then review factual claims.

Deadline previously verified: 11 Oct 2026 23:59 PDT, or 12 Oct 2026 15:59 JST. Confirm the current challenge page before submission.
