from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

load_dotenv()

from database import engine, SessionLocal
from models import Base, ForecastVersion
from routers import versions, loans, nhc, land_bucket, hhh, profit_sharing, imports, export, summary


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables
    Base.metadata.create_all(bind=engine)
    # Seed default version if none exist
    db = SessionLocal()
    try:
        count = db.query(ForecastVersion).count()
        if count == 0:
            from datetime import date
            default_version = ForecastVersion(
                label="Initial",
                snapshot_date=date.today()
            )
            db.add(default_version)
            db.commit()
    finally:
        db.close()
    yield


app = FastAPI(title="SNCC Forecast API", version="1.0.0", lifespan=lifespan)

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

# Optional: serve frontend build
frontend_build = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_build):
    app.mount("/", StaticFiles(directory=frontend_build, html=True), name="static")


@app.get("/health")
def health_check():
    return {"status": "ok"}
