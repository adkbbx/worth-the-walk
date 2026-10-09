"""Fetch pinned public model assets into an ignored local cache."""
from pathlib import Path
import sys, json, hashlib
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.python'))
from huggingface_hub import HfApi, hf_hub_download

MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
manifest_path = ROOT / 'data/model.json'
old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
revision = old.get('revision') or HfApi().model_info(MODEL).sha
manifest = {'id': MODEL, 'revision': revision, 'dtype': 'q8', 'dimension': 384,
            'pooling': 'attention-masked mean, L2 normalized', 'files': {}}
for name in ['tokenizer.json', 'tokenizer_config.json', 'config.json', 'onnx/model_quantized.onnx']:
    local = Path(hf_hub_download(MODEL, name, revision=revision, local_dir=ROOT/'.model-cache'))
    manifest['files'][name] = {'sha256': hashlib.sha256(local.read_bytes()).hexdigest(), 'bytes': local.stat().st_size}
    print(f'Fetched {name}: {local.stat().st_size} bytes', flush=True)
manifest_path.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print('Pinned revision:', revision, flush=True)
