# Station Points

Select a train line and station in Tokyo or Kanagawa to check researched grocery shops, point-card conditions and dated offers.

The selector includes **74 stations**: all 30 distinct JR Nambu stations including the branch, all 27 Tokyu Den-en-toshi stations, 14 Tobu Skytree stations through Takenotsuka including Oshiage, and the original three Chūō/Sōbu pilot stations. Den-en-toshi is operated by Tokyu; it connects with Tokyo Metro Hanzomon services.

**Shop coverage is incomplete.** Koenji, Ogikubo and Kichijoji retain 5–7 shops each. Four additional physical branches provide five station-to-shop records at Shukugawara, Noborito, Sakura-shimmachi, Takatsu and Takenotsuka. There are 21 physical branches and 22 station-to-shop records total. Unresearched stations show a coverage explanation and an external nearby-supermarket search, not invented recommendations. See [STATIONS.md](STATIONS.md) for the complete list and per-station coverage.

The wallet has 13 choices, including d POINT, V POINT, Ponta, PayPay Points, nanaco, JRE POINT and TOBU POINT. Only checked chain affiliations affect filtering. PayPay/nanaco payment rewards and OK Club membership are distinguished from common point cards. Official program guides are available even when no matching branch has been researched. This remains a dated snapshot with no live sale feed.

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

The fixture has 14 manually reviewed Japanese paraphrases and 30 author-written queries, split equally between English and Japanese. Some queries have multiple acceptable relevant notices. Evaluation searches the entire corpus; UI station filtering changes the candidate set.

The additional Life and Welcia rules and program guides are not part of this 14-notice semantic index or its benchmark. At stations with no indexed notices, semantic search reports the missing coverage.

| Method | Queries | Hit@1 | Hit@3 | MRR |
| --- | ---: | ---: | ---: | ---: |
| Quantized multilingual MiniLM | 30 | 80.0% | 93.3% | 0.862 |
| Character-bigram Jaccard | 30 | 43.3% | 63.3% | 0.570 |

The gain is mostly cross-language retrieval. For Japanese queries, the lexical baseline already reaches 73.3% Hit@1 and 93.3% Hit@3. The [per-query report](data/evaluation.json) includes every ranking and runtime measurements. `/evaluation.html` displays the results and first-result misses.

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
