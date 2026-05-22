from datetime import date
from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session
import models
from services.draw_analyzer import analyze_draws
from services.lb_engine import calculate_lb
from services.nhc_engine import calculate_nhc, DEFAULT_SF_CURVE, DEFAULT_MF_CURVE


def calculate_yield(version_id: int, db: Session, lb_rate: float = 0.0525, num_months: int = 12) -> dict:
    """
    loan_yield[m] = sum(loan_balance[m] × interest_rate / 12)
    lb_yield[m] = LB_total[m] × lb_rate / 12
    profit_sharing[m] = sum(closings_count × avg_profit_per_unit)
    total_income[m] = loan_yield + lb_yield + profit_sharing
    """
    today = date.today()
    start_month = today.replace(day=1)
    months = [(start_month + relativedelta(months=m)).isoformat() for m in range(num_months)]

    # Get all loans
    loans = db.query(models.Loan).filter(models.Loan.version_id == version_id).all()

    loan_yield = [0.0] * num_months

    if loans:
        draws = analyze_draws(loans, num_months)
        # Map loan by number/id to interest rate
        loan_rate_map = {}
        for loan in loans:
            key = loan.loan_number or str(loan.id)
            loan_rate_map[key] = loan.interest_rate or 0.0

        for loan_key, loan_data in draws.items():
            rate = loan_rate_map.get(loan_key, 0.0)
            for m_idx, balance in enumerate(loan_data["balances"]):
                loan_yield[m_idx] += balance * (rate / 12.0)

    loan_yield = [round(v, 2) for v in loan_yield]

    # NHC origination yield (new loans originated via NHC assumptions × their interest rates)
    nhc_assumptions = db.query(models.NHCAssumption).filter(
        models.NHCAssumption.version_id == version_id
    ).all()
    draw_curves_db = db.query(models.DrawCurve).filter(
        models.DrawCurve.version_id == version_id
    ).all()
    draw_curves = {c.product_type: c.curve_values for c in draw_curves_db}
    if "SF" not in draw_curves:
        draw_curves["SF"] = DEFAULT_SF_CURVE
    if "MF" not in draw_curves:
        draw_curves["MF"] = DEFAULT_MF_CURVE

    nhc_result = calculate_nhc(nhc_assumptions, draw_curves, num_months)
    nhc_yield = [
        round(nhc_result["sf_nhc_yield"][m] + nhc_result["mf_nhc_yield"][m], 2)
        for m in range(num_months)
    ]

    # Land Bucket yield
    lb_projects = db.query(models.LBProject).filter(
        models.LBProject.version_id == version_id
    ).all()

    monthly_assumptions_raw = {}
    for proj in lb_projects:
        monthly_assumptions_raw[proj.id] = {}
        for ma in proj.monthly_assumptions:
            fm = ma.forecast_month
            if hasattr(fm, 'date'):
                fm = fm.date()
            monthly_assumptions_raw[proj.id][fm.isoformat()] = {
                "dev_cost_increase": ma.dev_cost_increase,
                "lot_paydown_amount": ma.lot_paydown_amount,
                "lots_released": ma.lots_released
            }

    lb_result = calculate_lb(lb_projects, monthly_assumptions_raw, num_months)
    lb_yield = [round(lb_result["totals"][m] * lb_rate / 12.0, 2) for m in range(num_months)]

    # Profit sharing
    profit_sharing_assumptions = db.query(models.ProfitSharingAssumption).filter(
        models.ProfitSharingAssumption.version_id == version_id
    ).all()

    profit_sharing = [0.0] * num_months
    for ps in profit_sharing_assumptions:
        fm = ps.forecast_month
        if hasattr(fm, 'date'):
            fm = fm.date()
        month_key = fm.replace(day=1).isoformat() if fm else None
        if month_key and month_key in months:
            m_idx = months.index(month_key)
            profit_sharing[m_idx] += (ps.closings_count or 0) * (ps.avg_profit_per_unit or 0.0)

    profit_sharing = [round(v, 2) for v in profit_sharing]

    total_income = [
        round(loan_yield[m] + nhc_yield[m] + lb_yield[m] + profit_sharing[m], 2)
        for m in range(num_months)
    ]

    return {
        "months": months,
        "loan_yield": loan_yield,
        "nhc_yield": nhc_yield,
        "lb_yield": lb_yield,
        "profit_sharing": profit_sharing,
        "total_income": total_income,
        "lb_rate": lb_rate
    }
