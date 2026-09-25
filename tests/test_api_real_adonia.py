import sys
sys.path.insert(0,'backend')
from fastapi.testclient import TestClient
from main import app

PL='/mnt/data/10. CPMI-2026-01169 CP PL.xlsx'
DRAFT='/mnt/data/10. DRAFT DOC ADONIA 01169 20 Update No AJU Revisi 1512.xlsx'


def test_api_real_adonia_validation():
    c=TestClient(app)
    with open(PL,'rb') as a, open(DRAFT,'rb') as b:
        r=c.post('/api/validation/validate', files=[
            ('files',('adonia.xlsx',a,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
            ('files',('draft.xlsx',b,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
        ])
    assert r.status_code == 200, r.text
    j=r.json()
    assert j['result']['overall_status']=='MATCH'
    assert len(j['result']['items'])==20
    assert j['result']['mismatches']==[]
