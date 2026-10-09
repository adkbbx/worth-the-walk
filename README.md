# Station Points

Select a train line and station in Tokyo or Kanagawa to check researched grocery shops, point-card conditions and dated offers.

The selector includes **74 stations**: all 30 distinct JR Nambu stations including the branch, all 27 Tokyu Den-en-toshi stations, 14 Tobu Skytree stations through Takenotsuka including Oshiage, and the original three Chūō/Sōbu pilot stations. Den-en-toshi is operated by Tokyu; it connects with Tokyo Metro Hanzomon services.

**All 74 stations have at least five sourced candidates.** The snapshot contains 544 distinct branches and 1,898 station-to-branch associations. The app displays up to ten options, prioritized by selected memberships and distance. Candidates are within 2.5 km straight-line distance or have explicit station access on their official page; this is a directory sample, not every local shop. [STATIONS.md](STATIONS.md) lists coverage.

The wallet has 14 choices, including d POINT, V POINT, Ponta, PayPay Points, nanaco, JRE POINT, TOBU POINT and Sanwa/Food One. Branch card flags restrict chain defaults where available. Payment acceptance does not establish earning eligibility. There are 207 dated flyer records from 87 Life, Tokyu and Sanwa branches; advertised periods and publication periods are labeled separately. Recurring point bonuses and cash-discount conditions are verified separately. Item prices are not automatically extracted.

Run `python scripts/refresh.py` for an incremental refresh. Flyers update daily, directories and rule sources weekly, coordinates monthly. Expired/stale flyers disappear; changed/stale rules stop producing point matches until reviewed. Scheduling is not enabled. See [REFRESH.md](REFRESH.md) for the runner, caching, review queue, tests and publication workflow. `/data-status.html` exposes coverage and checks.

## Run the app

Node.js 22 or later is sufficient. The static assets, notice embeddings, fonts, and evaluation output are committed.

```sh
node scripts/build.mjs
node --test tests/rules.test.mjs
node scripts/serve.mjs
```

Open `http://127.0.0.1:4175`. Model search is optional and downloads about 135 MB of model/tokenizer assets plus runtime files on first use. The core store comparison works without this download. There is no account or API key.

The browser fetches the model from Hugging Face and Transformers.js 3.8.1 from jsDelivr. Queries are encoded locally with ONNX Runtime WASM and are not sent to an inference API. Point-card selections are saved in the browser's local storage. Station selection appears in the URL. Google Maps receives the origin and destination when you open directions. Retailer links open their own websites.

## What the open-source AI does

Multilingual MiniLM ranks source-reviewed Japanese notice paraphrases against English or Japanese queries. For example, “cheaper food when I pay with banknotes” finds the OK Club cash-discount condition without needing the Japanese wording.

The model does **not** read flyer images, extract prices, calculate points, or determine whether a payment qualifies. Point facts and the single advertised item price were manually checked against official sources. Date rules and store ordering are deterministic. Similarity scores are not probabilities.

- Base model: [sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2), Apache-2.0.
- ONNX conversion: [Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2).
- Revision and file SHA-256 hashes: [data/model.json](data/model.json).
- 384 dimensions, q8, attention-masked mean pooling, L2 normalization, 128-token maximum.

## Reproduce retrieval evaluation

Use Python 3.12. This installation stays within the project folder.

```sh
python -m pip install --target .python -r requirements.txt
python scripts/download_model.py
python scripts/embeddings.py
python scripts/evaluate.py
node scripts/build.mjs
```

The download script reuses the recorded revision. The encoder verifies file hashes before inference. The index is built from Japanese notice text only, without evaluation queries or expected IDs. No fine-tuning or query-based threshold tuning was performed.

The fixture has 20 manually reviewed Japanese paraphrases and 40 author-written queries, split equally between English and Japanese. Some queries have multiple acceptable relevant notices. Evaluation searches the entire corpus; UI station, rule freshness and notice-date filtering change the candidate set.

Life, Welcia and Sanwa are now included. Expired item notices and chains whose rules need review are filtered out in the browser. Flyer metadata does not trigger re-embedding; it is separate from the authored rule-notice corpus.

| Method | Queries | Hit@1 | Hit@3 | MRR |
| --- | ---: | ---: | ---: | ---: |
| Quantized multilingual MiniLM | 40 | 70.0% | 87.5% | 0.797 |
| Character-bigram Jaccard | 40 | 40.0% | 60.0% | 0.538 |

The gain is mostly cross-language retrieval. For Japanese queries, the lexical baseline reaches 65.0% Hit@1 and 95.0% Hit@3, compared with the model's 65.0% and 90.0%. Expanded coverage reduced the model's old headline score; those older 14-notice figures no longer describe the current corpus. The [per-query report](data/evaluation.json) includes every ranking and runtime measurements. `/evaluation.html` displays results and misses.

**This is a smoke benchmark, not a résumé-scale validation study.** The same project authored the paraphrases and queries. Labels were not independently audited. There is no held-out retailer test, field trial, OCR evaluation, or trained new model. Report these limits with the scores.

## Verify the browser

Install the development dependency, use an installed Microsoft Edge, and start the local server first.

```sh
npm install
npm run check:browser
```

To include the real browser model download and inference, set `TEST_AI=1`. Set `TEST_BROWSER=chrome` to use installed Chrome instead of Edge. Checks cover station selection, card ordering and filtering, empty-state recovery, promotion/service-end dates, source links, directions, and desktop/mobile overflow. Screenshots are saved in the ignored `.impeccable/review/` directory.

## Data and contribution rules

See [DATA.md](DATA.md). Add branch facts in `data/catalog.mjs`, notice paraphrases in `data/notices.json`, and independent evaluation queries in `data/eval-queries.json`. Regenerate embeddings after changing notice text. Keep missing point or price information explicitly unknown. A payment logo is not evidence of loyalty-program support.

The root workspace's separate Before I Call app is unrelated; this project lives in its own folder and repository.

## License

Project code and original annotations: MIT. Model and runtime dependencies keep their own licenses. Schibsted Grotesk font files use the SIL Open Font License, included in `dist/fonts/OFL.txt`. Retailer notices, logos, and flyer images are not relicensed; flyer images are not redistributed. Links and limited factual summaries retain source attribution.
