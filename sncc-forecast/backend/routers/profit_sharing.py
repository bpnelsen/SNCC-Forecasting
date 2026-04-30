from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
import models
from database import get_db

router = APIRouter()


class ProfitSharingSchema(BaseModel):
    id: Optional[int] = None
    builder: str
    product_type: Optional[str] = None
    avg_profit_per_unit: Optional[float] = 0.0
    forecast_month: date
    closings_count: Optional[int] = 0

    class Config:
        from_attributes = True


@router.get("/versions/{version_id}/profit-sharing", response_model=List[ProfitSharingSchema])
def get_profit_sharing(version_id: int, db: Session = Depends(get_db)):
    assumptions = db.query(models.ProfitSharingAssumption).filter(
        models.ProfitSharingAssumption.version_id == version_id
    ).order_by(models.ProfitSharingAssumption.forecast_month).all()
    return assumptions


@router.put("/versions/{version_id}/profit-sharing", response_model=List[ProfitSharingSchema])
def update_profit_sharing(
    version_id: int,
    data: List[ProfitSharingSchema],
    db: Session = Depends(get_db)
):
    version = db.query(models.ForecastVersion).filter(models.ForecastVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Delete existing
    db.query(models.ProfitSharingAssumption).filter(
        models.ProfitSharingAssumption.version_id == version_id
    ).delete()

    # Insert new
    result = []
    for item in data:
        ps = models.ProfitSharingAssumption(
            version_id=version_id,
            builder=item.builder,
            product_type=item.product_type,
            avg_profit_per_unit=item.avg_profit_per_unit or 0.0,
            forecast_month=item.forecast_month,
            closings_count=item.closings_count or 0
        )
        db.add(ps)
        result.append(ps)

    db.commit()
    for ps in result:
        db.refresh(ps)
    return result
