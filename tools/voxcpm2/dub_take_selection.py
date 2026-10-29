"""Resolve only exact immutable take identities for the computed speech recipe."""
import json
import re
from pathlib import Path
from dub_take_cache import digest


def selected_paths(file, paths, keys, forced, output, valid):
    if file is None:
        return paths, {}
    file=Path(file)
    if file.stat().st_size>8*1024*1024 or output is None:
        raise ValueError('Invalid take selection request.')
    data=json.loads(file.read_text(encoding='utf-8'))
    if not isinstance(data,dict) or len(data)>5000 or any(key not in keys or key in forced for key in data):
        raise ValueError('Selected groups do not match the speech plan.')
    result=list(paths);records={};root=Path(output).parent/'_dub_takes_v1'
    for index,key in enumerate(keys):
        if key not in data:continue
        row=data[key]
        if not isinstance(row,dict) or row.get('cache_key')!=paths[index].stem or not re.fullmatch('[a-f0-9]{64}',str(row.get('sha256',''))):
            raise ValueError('Selected take belongs to different text, voice or settings.')
        take=root/(row['sha256']+'.wav');record=row.get('record')
        if take.resolve()!=take.absolute() or digest(take)!=row['sha256'] or not valid(take):
            raise ValueError('Selected take is missing or changed.')
        if not isinstance(record,dict) or record.get('status') not in ('ready','review') or not isinstance(record.get('text'),str) or not record['text'].strip() or len(record['text'])>16000 or not isinstance(record.get('verification'),dict):
            raise ValueError('Selected take has no trustworthy speech record.')
        result[index]=take;records[key]=dict(record)
    return result,records
