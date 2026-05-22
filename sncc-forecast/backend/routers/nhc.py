from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
import models
from database import get_db
from services.nhc_engine import DEFAULT_SF_CURVE, DEFAULT_MF_CURVE

router = APIRouter()


class NHCAssumptionSchema(BaseModel):
    id: Optional[int] = None
    development_name: str
    builder: Optional[str] = None
    forecast_month: date
    mf_starts: Optional[int] = 0
    sf_starts: Optional[int] = 0
    mf_loan_amount: Optional[float] = 0.0
    sf_loan_amount: Optional[float] = 0.0
    mf_payoffs: Optional[int] = 0
    sf_payoffs: Optional[int] = 0
    memorial_amount: Optional[float] = 0.0
    sf_interest_rate: Optional[float] = 0.085
    mf_interest_rate: Optional[float] = 0.085

    class Config:
        from_attributes = True


class DrawCurveSchema(BaseModel):
    id: Optional[int] = None
    product_type: str
    curve_values: List[float]

    class Config:
        from_attributes = True


@router.get("/versions/{version_id}/nhc", response_model=List[NHCAssumptionSchema])
def get_nhc(version_id: int, db: Session = Depends(get_db)):
    assumptions = db.query(models.NHCAssumption).filter(
        models.NHCAssumption.version_id == version_id
    ).order_by(models.NHCAssumption.forecast_month).all()
    return assumptions


@router.put("/versions/{version_id}/nhc", response_model=List[NHCAssumptionSchema])
def update_nhc(version_id: int, data: List[NHCAssumptionSchema], db: Session = Depends(get_db)):
    # Check version exists
    version = db.query(models.ForecastVersion).filter(models.ForecastVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Delete existing
    db.query(models.NHCAssumption).filter(models.NHCAssumption.version_id == version_id).delete()

    # Insert new
    result = []
    for item in data:
        assumption = models.NHCAssumption(
            version_id=version_id,
            development_name=item.development_name,
            builder=item.builder,
            forecast_month=item.forecast_month,
            mf_starts=item.mf_starts or 0,
            sf_starts=item.sf_starts or 0,
            mf_loan_amount=item.mf_loan_amount or 0.0,
            sf_loan_amount=item.sf_loan_amount or 0.0,
            mf_payoffs=item.mf_payoffs or 0,
            sf_payoffs=item.sf_payoffs or 0,
            memorial_amount=item.memorial_amount or 0.0,
            sf_interest_rate=item.sf_interest_rate if item.sf_interest_rate is not None else 0.085,
            mf_interest_rate=item.mf_interest_rate if item.mf_interest_rate is not None else 0.085,
        )
        db.add(assumption)
        result.append(assumption)

    db.commit()
    for a in result:
        db.refresh(a)
    return result


@router.get("/versions/{version_id}/draw-curves", response_model=List[DrawCurveSchema])
def get_draw_curves(version_id: int, db: Session = Depends(get_db)):
    curves = db.query(models.DrawCurve).filter(
        models.DrawCurve.version_id == version_id
    ).all()

    # If no curves exist, return defaults
    if not curves:
        return [
            DrawCurveSchema(product_type="SF", curve_values=DEFAULT_SF_CURVE),
            DrawCurveSchema(product_type="MF", curve_values=DEFAULT_MF_CURVE)
        ]

    return curves


@router.put("/versions/{version_id}/draw-curves", response_model=DrawCurveSchema)
def update_draw_curves(version_id: int, data: DrawCurveSchema, db: Session = Depends(get_db)):
    version = db.query(models.ForecastVersion).filter(models.ForecastVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    existing = db.query(models.DrawCurve).filter(
        models.DrawCurve.version_id == version_id,
        models.DrawCurve.product_type == data.product_type
    ).first()

    if existing:
        existing.curve_values = data.curve_values
        db.commit()
        db.refresh(existing)
        return existing
    else:
        curve = models.DrawCurve(
            version_id=version_id,
            product_type=data.product_type,
            curve_values=data.curve_values
        )
        db.add(curve)
        db.commit()
        db.refresh(curve)
        return curve
