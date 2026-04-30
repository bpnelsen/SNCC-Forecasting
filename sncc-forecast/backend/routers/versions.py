from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
import models
from database import get_db

router = APIRouter()


class VersionCreate(BaseModel):
    label: str
    snapshot_date: Optional[date] = None


class VersionResponse(BaseModel):
    id: int
    label: str
    snapshot_date: Optional[date]
    import_date: Optional[datetime]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


@router.get("/versions", response_model=list[VersionResponse])
def list_versions(db: Session = Depends(get_db)):
    versions = db.query(models.ForecastVersion).order_by(models.ForecastVersion.created_at.desc()).all()
    return versions


@router.post("/versions", response_model=VersionResponse)
def create_version(data: VersionCreate, db: Session = Depends(get_db)):
    version = models.ForecastVersion(
        label=data.label,
        snapshot_date=data.snapshot_date,
        import_date=datetime.utcnow()
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version
