from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
import models
from database import get_db

router = APIRouter()


class LBMonthlyAssumptionSchema(BaseModel):
    id: Optional[int] = None
    forecast_month: date
    dev_cost_increase: Optional[float] = 0.0
    lot_paydown_amount: Optional[float] = 0.0
    lots_released: Optional[int] = 0

    class Config:
        from_attributes = True


class LBProjectSchema(BaseModel):
    id: int
    version_id: int
    dept_code: Optional[str] = None
    builder: Optional[str] = None
    project_name: Optional[str] = None
    phase: Optional[str] = None
    total_lots: Optional[int] = None
    current_balance: Optional[float] = None
    total_budget: Optional[float] = None
    development_costs_remaining: Optional[float] = None
    monthly_assumptions: List[LBMonthlyAssumptionSchema] = []

    class Config:
        from_attributes = True


@router.get("/versions/{version_id}/land-bucket", response_model=List[LBProjectSchema])
def get_land_bucket(version_id: int, db: Session = Depends(get_db)):
    projects = db.query(models.LBProject).filter(
        models.LBProject.version_id == version_id
    ).all()
    return projects


@router.put("/versions/{version_id}/land-bucket/{project_id}/monthly", response_model=List[LBMonthlyAssumptionSchema])
def update_lb_monthly(
    version_id: int,
    project_id: int,
    data: List[LBMonthlyAssumptionSchema],
    db: Session = Depends(get_db)
):
    project = db.query(models.LBProject).filter(
        models.LBProject.id == project_id,
        models.LBProject.version_id == version_id
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete existing monthly assumptions for this project
    db.query(models.LBMonthlyAssumption).filter(
        models.LBMonthlyAssumption.lb_project_id == project_id
    ).delete()

    # Insert new
    result = []
    for item in data:
        ma = models.LBMonthlyAssumption(
            lb_project_id=project_id,
            forecast_month=item.forecast_month,
            dev_cost_increase=item.dev_cost_increase or 0.0,
            lot_paydown_amount=item.lot_paydown_amount or 0.0,
            lots_released=item.lots_released or 0
        )
        db.add(ma)
        result.append(ma)

    db.commit()
    for ma in result:
        db.refresh(ma)
    return result
