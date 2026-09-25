import sys
sys.path.insert(0,'backend')
from fastapi.testclient import TestClient
from main import app


def test_api_smoke():
    c=TestClient(app)
    r=c.get('/api/health')
    assert r.status_code == 200
    assert r.json()['status'] == 'ok'
    assert r.json()['version'] == '1.7.0'
    assert c.get('/api/customers').status_code == 200
    assert c.get('/api/history').status_code == 200
