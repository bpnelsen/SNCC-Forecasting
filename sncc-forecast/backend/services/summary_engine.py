from datetime import date
from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session
import models
from services.draw_analyzer import analyze_draws
from services.nhc_engine import calculate_nhc, DEFAULT_SF_CURVE, DEFAULT_MF_CURVE
from services.lb_engine import calculate_lb
from services.hhh_engine import calculate_hhh


def calculate_summary(version_id: int, db: Session, num_months: int = 12) -> dict:
    """
    Aggregates all engines:
    SFR_total[m] = sum of SFR loan draw balances[m]
    MFR_total[m] = sum of MFR loan draw balances[m] + forecasted_MF_balance[m]
    AD_total[m] = sum of AD loan draw balances[m]
    RawLand_total[m] = sum of RawLand loan draw balances[m]
    FinishedLots_total[m] = sum of FinishedLots loan draw balances[m]
    LB_total[m] = lb_engine grand total[m]
    HHH_total[m] = hhh_engine grand total[m]
    Total_Loans[m] = SFR + MFR + AD + RawLand + FinishedLots
    Total_ALL[m] = Total_Loans + LB_total + HHH_total
    Variance[m] = Total_ALL[m] - Total_ALL[m-1]
    """
    today = date.today()
    start_month = today.replace(day=1)
    months = [(start_month + relativedelta(months=m)).isoformat() for m in range(num_months)]

    zeros = [0.0] * num_months

    # Get loans
    loans = db.query(models.Loan).filter(models.Loan.version_id == version_id).all()

    # Categorize loans
    sfr_loans = [l for l in loans if l.loan_type == "SFR"]
    mf_loans = [l for l in loans if l.loan_type == "MF"]
    ad_loans = [l for l in loans if l.loan_type == "AD"]
    raw_land_loans = [l for l in loans if l.loan_type == "RawLand"]
    finished_lots_loans = [l for l in loans if l.loan_type == "FinishedLots"]

    def sum_loan_balances(loan_list):
        if not loan_list:
            return [0.0] * num_months
        draws = analyze_draws(loan_list, num_months)
        totals = [0.0] * num_months
        for loan_data in draws.values():
            for m_idx, bal in enumerate(loan_data["balances"]):
                totals[m_idx] += bal
        return [round(v, 2) for v in totals]

    sfr_totals = sum_loan_balances(sfr_loans)
    mf_loan_totals = sum_loan_balances(mf_loans)
    ad_totals = sum_loan_balances(ad_loans)
    raw_land_totals = sum_loan_balances(raw_land_loans)
    finished_lots_totals = sum_loan_balances(finished_lots_loans)

    # NHC engine for forecasted new originations
    nhc_assumptions = db.query(models.NHCAssumption).filter(
        models.NHCAssumption.version_id == version_id
    ).all()

    draw_curves_db = db.query(models.DrawCurve).filter(
        models.DrawCurve.version_id == version_id
    ).all()
    draw_curves = {}
    for dc in draw_curves_db:
        draw_curves[dc.product_type] = dc.curve_values
    if "SF" not in draw_curves:
        draw_curves["SF"] = DEFAULT_SF_CURVE
    if "MF" not in draw_curves:
        draw_curves["MF"] = DEFAULT_MF_CURVE

    nhc_result = calculate_nhc(nhc_assumptions, draw_curves, num_months)

    # Combine MF: existing loans + forecasted new
    mf_totals = [round(mf_loan_totals[m] + nhc_result["mf_balances"][m], 2) for m in range(num_months)]
    # SFR also gets NHC contribution
    sfr_nhc_totals = [round(sfr_totals[m] + nhc_result["sf_balances"][m], 2) for m in range(num_months)]

    # Land Bucket
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
    lb_totals = lb_result["totals"]

    # HHH
    hhh_investments = db.query(models.HHHInvestment).filter(
        models.HHHInvestment.version_id == version_id
    ).all()
    hhh_result = calculate_hhh(hhh_investments, num_months)
    hhh_totals = hhh_result["totals"]

    # Aggregations
    total_loans = [round(sfr_nhc_totals[m] + mf_totals[m] + ad_totals[m] + raw_land_totals[m] + finished_lots_totals[m], 2) for m in range(num_months)]
    total_all = [round(total_loans[m] + lb_totals[m] + hhh_totals[m], 2) for m in range(num_months)]

    variance = [0.0] * num_months
    for m in range(num_months):
        if m == 0:
            variance[m] = 0.0
        else:
            variance[m] = round(total_all[m] - total_all[m - 1], 2)

    return {
        "months": months,
        "sfr": sfr_nhc_totals,
        "mf": mf_totals,
        "ad": ad_totals,
        "raw_land": raw_land_totals,
        "finished_lots": finished_lots_totals,
        "total_loans": total_loans,
        "land_bucket": lb_totals,
        "hhh": hhh_totals,
        "total_all": total_all,
        "variance": variance,
        "nhc_sf_originations": nhc_result["sf_originations"],
        "nhc_mf_originations": nhc_result["mf_originations"],
    }
