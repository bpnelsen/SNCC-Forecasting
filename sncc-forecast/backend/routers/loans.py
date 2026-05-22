from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
import models
from database import get_db
from services.draw_analyzer import analyze_draws

router = APIRouter()


class LoanResponse(BaseModel):
    id: int
    version_id: int
    loan_number: Optional[str]
    borrower: Optional[str]
    loan_program: Optional[str]
    loan_type: Optional[str]
    loan_amount: Optional[float]
    funded_date: Optional[date]
    maturity_date: Optional[date]
    current_balance: Optional[float]
    loan_remaining: Optional[float]
    interest_rate: Optional[float]
    development_name: Optional[str]
    subdivision_name: Optional[str]
    projected_balance: Optional[float]
    monthly_draw_increase: Optional[float]
    draw_flagged: Optional[bool]
    draw_flag_reason: Optional[str]

    class Config:
        from_attributes = True


class LoanUpdate(BaseModel):
    monthly_draw_increase: Optional[float] = None


class PaginatedLoans(BaseModel):
    items: List[LoanResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get("/versions/{version_id}/loans", response_model=PaginatedLoans)
def get_loans(
    version_id: int,
    loan_type: Optional[str] = Query(None, alias="type"),
    flagged: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):
    query = db.query(models.Loan).filter(models.Loan.version_id == version_id)

    if loan_type:
        query = query.filter(models.Loan.loan_type == loan_type)
    if flagged is not None:
        query = query.filter(models.Loan.draw_flagged == flagged)

    total = query.count()
    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()
    total_pages = (total + page_size - 1) // page_size

    return PaginatedLoans(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.patch("/versions/{version_id}/loans/{loan_id}", response_model=LoanResponse)
def update_loan(
    version_id: int,
    loan_id: int,
    data: LoanUpdate,
    db: Session = Depends(get_db)
):
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.version_id == version_id
    ).first()

    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    if data.monthly_draw_increase is not None:
        loan.monthly_draw_increase = data.monthly_draw_increase

    db.commit()
    db.refresh(loan)
    return loan


@router.get("/versions/{version_id}/loans/{loan_id}/projections")
def get_loan_projections(
    version_id: int,
    loan_id: int,
    num_months: int = Query(24, ge=1, le=60),
    db: Session = Depends(get_db)
):
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.version_id == version_id
    ).first()

    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    result = analyze_draws([loan], num_months)
    key = loan.loan_number or str(loan.id)
    return result.get(key, {"balances": [], "months": []})
