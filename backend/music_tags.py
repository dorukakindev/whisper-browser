"""Bounded zero-shot CLAP hypotheses. Scores are cosine, never probabilities."""
import argparse, hashlib, json, os, sys, urllib.request
from pathlib import Path
from music_similarity import MODEL, REVISION, search, valid_vectors, emit

ASSETS={
 'tokenizer.json':(2108746,'77ef92283d67f0d97e1454909a964afcbfa2019f0fb9f18f8e88d5c25c3ba729'),
 'tokenizer_config.json':(384,'377f91458f7729a4574a84c77bdce67dbc3c58c1a345a29bbf8c4eb1307948a3'),
 'special_tokens_map.json':(280,'06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f')}
CATEGORIES={
 'genre':['blues','jazz','rock','classical','electronic','hip hop','folk','pop','soul','metal','reggae','country'],
 'mood':['calm','energetic','sad','happy','dark','romantic','tense','dreamy'],
 'instrument':['piano','acoustic guitar','electric guitar','bass guitar','drums','trumpet','saxophone','violin','flute','organ','synthesizer','harmonica'],
 'voice':['singing vocals','instrumental music without singing']}

def prepare(directory):
    for name,(size,sha) in ASSETS.items():
        target=directory/name
        if target.is_file() and target.stat().st_size==size and hashlib.sha256(target.read_bytes()).hexdigest()==sha:
            continue
        with urllib.request.urlopen(f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}',timeout=30) as response:
            data=response.read(size+1)
        if len(data)!=size or hashlib.sha256(data).hexdigest()!=sha:
            raise ValueError('Tokenizer checksum mismatch')
        temp=target.with_suffix('.tags-download');temp.write_bytes(data);os.replace(temp,target)
    return {'ready':True}

def scores(audio,text):
    import numpy as np
    a=valid_vectors(audio)
    x=np.asarray(text,dtype=np.float32)
    if x.ndim!=2 or x.shape[1]!=512 or not np.isfinite(x).all():
        raise ValueError('Invalid text embeddings')
    norms=np.linalg.norm(x,axis=1,keepdims=True)
    if (norms<1e-8).any():raise ValueError('Zero text embedding')
    return np.clip(a@(x/norms).T,-1,1)

def analyze(request,directory):
    for name,(size,sha) in ASSETS.items():
        if not (directory/name).is_file() or (directory/name).stat().st_size!=size or hashlib.sha256((directory/name).read_bytes()).hexdigest()!=sha:
            raise ValueError('Prepare label resources first / Önce etiket kaynaklarını hazırla.')
    data=search({**request,'tracks':[],'return_features':True},directory)
    import torch
    from transformers import ClapTextModelWithProjection, RobertaTokenizerFast
    torch.set_num_threads(2)
    tokenizer=RobertaTokenizerFast.from_pretrained(str(directory),local_files_only=True)
    model=ClapTextModelWithProjection.from_pretrained(str(directory),local_files_only=True,weights_only=True).eval()
    groups=[]
    for category,labels in CATEGORIES.items():
        emit(stage='tags',title=category)
        prompts=[f'This is {label} music.' if category in ['genre','mood'] else f'The sound of {label} in a music recording.' for label in labels]
        with torch.inference_mode():
            text=model(**tokenizer(prompts,padding=True,truncation=True,max_length=77,return_tensors='pt')).text_embeds.numpy()
        values=scores(data['vectors'],text)
        groups.append({'id':category,'labels':[{'id':label,'mean':round(float(values[:,i].mean()),5),'segments':[round(float(v),5) for v in values[:,i]]} for i,label in enumerate(labels)]})
    return {'method':'clap-zero-shot-v1','model':MODEL,'revision':REVISION,'segments':data['segments'],'groups':groups,'experimental':True}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--model-dir',required=True);p.add_argument('--prepare',action='store_true');a=p.parse_args()
    print(json.dumps(prepare(Path(a.model_dir)) if a.prepare else analyze(json.load(sys.stdin),Path(a.model_dir)),allow_nan=False))
