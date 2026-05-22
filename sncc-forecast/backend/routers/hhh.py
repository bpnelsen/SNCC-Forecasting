from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
import models
from database import get_db

router = APIRouter()


class HHHInvestmentSchema(BaseModel):
    id: int
    version_id: int
    investment_name: str
    current_balance: Optional[float] = None
    loan_amount: Optional[float] = None
    monthly_increase: Optional[float] = 0.0
    release_price: Optional[float] = None
    units_per_month: Optional[int] = 0
    monthly_deduction: Optional[float] = 0.0
    maturity_date: Optional[date] = None

    class Config:
        from_attributes = True


class HHHInvestmentUpdate(BaseModel):
    current_balance: Optional[float] = None
    loan_amount: Optional[float] = None
    monthly_increase: Optional[float] = None
    release_price: Optional[float] = None
    units_per_month: Optional[int] = None
    monthly_deduction: Optional[float] = None
    maturity_date: Optional[date] = None


@router.get("/versions/{version_id}/hhh", response_model=List[HHHInvestmentSchema])
def get_hhh(version_id: int, db: Session = Depends(get_db)):
    investments = db.query(models.HHHInvestment).filter(
        models.HHHInvestment.version_id == version_id
    ).all()
    return investments


@router.put("/versions/{version_id}/hhh/{investment_id}", response_model=HHHInvestmentSchema)
def update_hhh(
    version_id: int,
    investment_id: int,
    data: HHHInvestmentUpdate,
    db: Session = Depends(get_db)
):
    investment = db.query(models.HHHInvestment).filter(
        models.HHHInvestment.id == investment_id,
        models.HHHInvestment.version_id == version_id
    ).first()

    if not investment:
        raise HTTPException(status_code=404, detail="Investment not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(investment, key, value)

    db.commit()
    db.refresh(investment)
    return investment
