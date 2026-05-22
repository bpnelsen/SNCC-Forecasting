from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os

load_dotenv()

from database import engine, SessionLocal
from models import Base, ForecastVersion

from routers import versions, loans, nhc, land_bucket, hhh, profit_sharing, imports, export, summary

# Create tables and seed on module load (required for Vercel serverless cold starts)
def _init_db():
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            if db.query(ForecastVersion).count() == 0:
                from datetime import date
                db.add(ForecastVersion(label="Initial", snapshot_date=date.today()))
                db.commit()
        finally:
            db.close()
    except Exception as e:
        # Log but don't crash — lets /health still respond so Vercel shows the real error
        import traceback
        print(f"[SNCC] DB init error: {e}\n{traceback.format_exc()}")

_init_db()

app = FastAPI(title="SNCC Forecast API", version="1.0.0")

_origins = ["http://localhost:5174", "http://127.0.0.1:5174"]
if os.environ.get("FRONTEND_URL"):
    _origins.append(os.environ["FRONTEND_URL"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(versions.router, prefix="/api")
app.include_router(loans.router, prefix="/api")
app.include_router(nhc.router, prefix="/api")
app.include_router(land_bucket.router, prefix="/api")
app.include_router(hhh.router, prefix="/api")
app.include_router(profit_sharing.router, prefix="/api")
app.include_router(imports.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(summary.router, prefix="/api")

@app.get("/health")
def health_check():
    return {"status": "ok"}

# Serve frontend build if present (local only; Vercel hosts frontend separately)
frontend_build = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_build):
    app.mount("/", StaticFiles(directory=frontend_build, html=True), name="static")
