"""Pinned ONNX inference shared by indexing and offline retrieval evaluation."""
from pathlib import Path
import sys, json, hashlib
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'.python'))
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

class Encoder:
    def __init__(self):
        self.manifest=json.loads((ROOT/'data/model.json').read_text())
        for name, expected in self.manifest['files'].items():
            actual=hashlib.sha256((ROOT/'.model-cache'/name).read_bytes()).hexdigest()
            if actual != expected['sha256']: raise ValueError(f'Model checksum mismatch: {name}')
        self.tokenizer=Tokenizer.from_file(str(ROOT/'.model-cache/tokenizer.json'))
        self.tokenizer.enable_truncation(max_length=128)
        self.tokenizer.enable_padding(pad_id=0,pad_token='<pad>')
        options=ort.SessionOptions(); options.intra_op_num_threads=2
        self.session=ort.InferenceSession(str(ROOT/'.model-cache/onnx/model_quantized.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
    def encode(self,texts):
        encodings=self.tokenizer.encode_batch(texts)
        data={'input_ids':np.array([e.ids for e in encodings],dtype=np.int64),
              'attention_mask':np.array([e.attention_mask for e in encodings],dtype=np.int64),
              'token_type_ids':np.array([e.type_ids for e in encodings],dtype=np.int64)}
        output=self.session.run(None,{i.name:data[i.name] for i in self.session.get_inputs()})[0]
        mask=data['attention_mask'][...,None]
        pooled=(output*mask).sum(axis=1)/np.maximum(mask.sum(axis=1),1)
        return pooled/np.maximum(np.linalg.norm(pooled,axis=1,keepdims=True),1e-12)

if __name__=='__main__':
    encoder=Encoder()
    notices=json.loads((ROOT/'data/notices.json').read_text(encoding='utf-8'))
    vectors=encoder.encode([n['text'] for n in notices])
    for notice,vector in zip(notices,vectors):notice['vector']=[round(float(v),8) for v in vector]
    (ROOT/'data/notice-index.json').write_text(json.dumps(notices,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(f'Indexed {len(notices)} Japanese notices, {vectors.shape[1]} dimensions.')
