"""Evaluate retrieval without using the evaluation queries to build the index."""
import json,time,re,platform,html,statistics
from embeddings import ROOT,Encoder,np

def lexical(query,document):
    # Character bigram Jaccard: supports Japanese and avoids an English-only straw man.
    def grams(s):
        s=re.sub(r'\s+','',s.lower())
        return set(s[i:i+2] for i in range(len(s)-1))
    a,b=grams(query),grams(document)
    return len(a&b)/max(len(a|b),1)

def metrics(records):
    return {"n":len(records),"hit_at_1":sum(r['rank']==1 for r in records)/len(records),
            "hit_at_3":sum(r['rank']<=3 for r in records)/len(records),
            "mrr":sum(1/r['rank'] for r in records)/len(records)}

notices=json.loads((ROOT/'data/notice-index.json').read_text(encoding='utf-8'))
queries=json.loads((ROOT/'data/eval-queries.json').read_text(encoding='utf-8'))
start=time.perf_counter();encoder=Encoder();load_ms=(time.perf_counter()-start)*1000
vectors=np.array([n['vector'] for n in notices]);results=[];latencies=[]
for q in queries:
    start=time.perf_counter();v=encoder.encode([q['query']])[0];latencies.append((time.perf_counter()-start)*1000)
    semantic=np.argsort(-(vectors@v)).tolist()
    baseline=sorted(range(len(notices)),key=lambda i:(-lexical(q['query'],notices[i]['text']),notices[i]['id']))
    row={**q,'semantic_order':[notices[i]['id'] for i in semantic], 'lexical_order':[notices[i]['id'] for i in baseline]}
    results.append(row)
report={'protocol':f'{len(queries)} author-written EN/JA queries against {len(notices)} source-reviewed Japanese paraphrases. No training or tuning on these queries. Full-corpus evaluation; UI station and freshness filtering can differ. Not a real-user or OCR benchmark.',
        'model':encoder.manifest,'baseline':'Japanese-compatible character bigram Jaccard, stable id tie-break',
        'runtime':{'platform':platform.platform(),'python':platform.python_version(),'onnxruntime':__import__('onnxruntime').__version__,'threads':2,'load_ms':round(load_ms,2),'median_single_query_ms':round(statistics.median(latencies),2)},'metrics':{},'results':results}
for method in ['semantic','lexical']:
    report['metrics'][method]={}
    for language in ['all','en','ja']:
        selected=[r for r in results if language=='all' or r['language']==language]
        ranks=[{'rank':min(r[method+'_order'].index(id)+1 for id in r['relevant'])} for r in selected]
        report['metrics'][method][language]=metrics(ranks)
(ROOT/'data/evaluation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'metrics':report['metrics'],'runtime':report['runtime']},indent=2))
rows=''.join(f"<tr><td>{method}</td><td>{lang}</td><td>{m['n']}</td><td>{m['hit_at_1']:.1%}</td><td>{m['hit_at_3']:.1%}</td><td>{m['mrr']:.3f}</td></tr>" for method,langs in report['metrics'].items() for lang,m in langs.items())
failures=''.join(f"<li>{html.escape(r['query'])}: first result <code>{r['semantic_order'][0]}</code>; expected <code>{', '.join(r['relevant'])}</code>.</li>" for r in results if r['semantic_order'][0] not in r['relevant'])
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Station Points — model evaluation</title><link rel="stylesheet" href="/styles.css"><main class="evaluation"><a href="/">Back to the station finder</a><h1 style="margin-top:24px">Finding a relevant notice,<br>without inventing an offer.</h1><p>Station Points uses the Apache-2.0 multilingual MiniLM model in a quantized ONNX conversion. It embeds Japanese notices and an English or Japanese query, then ranks notices by cosine similarity. The browser runs the same pinned model locally. No query goes to an inference service.</p><h2>What was measured</h2><p>{html.escape(report['protocol'])}</p><p>Each query has one or more relevant notice IDs fixed before the evaluation run. Hit@k measures whether any relevant notice appears in the first k results. MRR is the reciprocal rank of the first relevant result. Scores are not probabilities.</p><table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px"><thead><tr><th>Method</th><th>Language</th><th>Queries</th><th>Hit@1</th><th>Hit@3</th><th>MRR</th></tr></thead><tbody>{rows}</tbody></table><h2>Failures are part of the result</h2><ul>{failures or '<li>No first-result misses in this small fixture.</li>'}</ul><p>Similar bonus notices and negated payment conditions can be confused. Always read the displayed conditions. Search never computes prices, eligibility or points; those remain source-reviewed facts and deterministic date rules.</p><h2>Limits</h2><p>This is a small, author-written smoke benchmark. Queries and Japanese paraphrases were created by the same project, so author bias and wording overlap remain. No independent labels, confidence calibration, held-out-store validation, price extraction, flyer OCR or field trial has been completed. Nationwide coverage and substantial model development remain future work.</p><p>CPU median query inference: {report['runtime']['median_single_query_ms']:.0f} ms after model load. This is a local Python measurement, not a browser speed promise. Browser startup downloads roughly 135 MB of tokenizer/model assets plus runtime files.</p><h2>Reproduce the result</h2><pre>python -m pip install --target .python -r requirements.txt\npython scripts/download_model.py\npython scripts/embeddings.py\npython scripts/evaluate.py\nnode scripts/build.mjs\nnode --test tests/rules.test.mjs</pre><p>Model revision: <code style="overflow-wrap:anywhere">{encoder.manifest['revision']}</code>. File hashes are recorded in model.json.</p><p><a href="https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2">Original model card</a> · <a href="https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2">ONNX conversion</a> · <a href="/evaluation.json">Per-query results and hashes</a></p></main></html>'''
(ROOT/'dist/evaluation.html').write_text(page,encoding='utf-8')
(ROOT/'dist/evaluation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
