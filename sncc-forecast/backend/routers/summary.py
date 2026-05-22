from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from services.summary_engine import calculate_summary
from services.yield_engine import calculate_yield

router = APIRouter()


@router.get("/versions/{version_id}/summary")
def get_summary(
    version_id: int,
    num_months: int = Query(12, ge=1, le=60),
    db: Session = Depends(get_db)
):
    try:
        result = calculate_summary(version_id, db, num_months)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary calculation failed: {str(e)}")


@router.get("/versions/{version_id}/yield")
def get_yield(
    version_id: int,
    lb_rate: float = Query(0.0525, ge=0, le=1),
    num_months: int = Query(12, ge=1, le=60),
    db: Session = Depends(get_db)
):
    try:
        result = calculate_yield(version_id, db, lb_rate=lb_rate, num_months=num_months)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yield calculation failed: {str(e)}")
