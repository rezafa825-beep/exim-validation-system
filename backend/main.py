from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.seed import seed
from api.validation import router as validation_router
from api.customers import router as customer_router
from api.history import router as history_router

app=FastAPI(title="EXIM Validation System",version="1.7.0")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
seed()
app.include_router(validation_router)
app.include_router(customer_router)
app.include_router(history_router)
@app.get("/api/health")
def health(): return {"status":"ok","version":"1.7.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app,host="0.0.0.0",port=8000)
