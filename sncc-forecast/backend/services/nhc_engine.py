from datetime import date
from dateutil.relativedelta import relativedelta


DEFAULT_SF_CURVE = [0.05, 0.10, 0.15, 0.15, 0.15, 0.10, 0.10, 0.08, 0.05, 0.04, 0.03]
DEFAULT_MF_CURVE = [0.05, 0.10, 0.15, 0.15, 0.15, 0.10, 0.10, 0.08, 0.05, 0.04, 0.03]


def calculate_nhc(assumptions: list, draw_curves: dict, num_months: int = 12) -> dict:
    """
    For each development x month, calculate new loan origination amount.
    MF_addition = mf_starts x mf_loan_amount
    SF_addition = sf_starts x sf_loan_amount
    Apply draw curves to each cohort of new originations
    Subtractions = mf_payoffs x avg_mf_loan + sf_payoffs x avg_sf_loan
    Returns: {mf_balances, sf_balances, mf_originations, sf_originations}
    """
    today = date.today()
    start_month = today.replace(day=1)
    months = [start_month + relativedelta(months=m) for m in range(num_months)]

    sf_curve = draw_curves.get("SF", DEFAULT_SF_CURVE)
    mf_curve = draw_curves.get("MF", DEFAULT_MF_CURVE)

    # Organize assumptions by month
    assumptions_by_month = {}
    for assumption in assumptions:
        fm = assumption.forecast_month
        if hasattr(fm, 'date'):
            fm = fm.date()
        month_key = fm.replace(day=1) if fm else None
        if month_key:
            if month_key not in assumptions_by_month:
                assumptions_by_month[month_key] = []
            assumptions_by_month[month_key].append(assumption)

    # Track cohorts: (origination_month_index, product_type, amount_per_unit, count)
    sf_cohorts = []  # (start_month_idx, total_origination_amount)
    mf_cohorts = []

    sf_originations = [0.0] * num_months
    mf_originations = [0.0] * num_months
    # Weighted-average interest rates per cohort for yield calculations
    sf_cohort_rates = []  # parallel to sf_cohorts: (start_month_idx, amount, rate)
    mf_cohort_rates = []

    for m_idx, month in enumerate(months):
        month_assumptions = assumptions_by_month.get(month, [])
        sf_new = 0.0
        mf_new = 0.0
        sf_rate_weighted = 0.0
        mf_rate_weighted = 0.0

        for a in month_assumptions:
            sf_amt = (a.sf_starts or 0) * (a.sf_loan_amount or 0)
            mf_amt = (a.mf_starts or 0) * (a.mf_loan_amount or 0)
            sf_new += sf_amt
            mf_new += mf_amt
            sf_rate_weighted += sf_amt * (getattr(a, 'sf_interest_rate', None) or 0.085)
            mf_rate_weighted += mf_amt * (getattr(a, 'mf_interest_rate', None) or 0.085)
            avg_sf = a.sf_loan_amount or 0
            avg_mf = a.mf_loan_amount or 0

        sf_rate = (sf_rate_weighted / sf_new) if sf_new > 0 else 0.085
        mf_rate = (mf_rate_weighted / mf_new) if mf_new > 0 else 0.085

        if sf_new > 0:
            sf_cohorts.append((m_idx, sf_new))
            sf_cohort_rates.append((m_idx, sf_new, sf_rate))
            sf_originations[m_idx] = sf_new
        if mf_new > 0:
            mf_cohorts.append((m_idx, mf_new))
            mf_cohort_rates.append((m_idx, mf_new, mf_rate))
            mf_originations[m_idx] = mf_new

    # Calculate balances by applying draw curves to cohorts
    sf_balances = [0.0] * num_months
    mf_balances = [0.0] * num_months

    for m_idx in range(num_months):
        sf_balance = 0.0
        mf_balance = 0.0

        for (cohort_start, cohort_amount) in sf_cohorts:
            age = m_idx - cohort_start
            if 0 <= age < len(sf_curve):
                # Cumulative draw up to this age
                cumulative = sum(sf_curve[:age + 1])
                sf_balance += cohort_amount * cumulative

        for (cohort_start, cohort_amount) in mf_cohorts:
            age = m_idx - cohort_start
            if 0 <= age < len(mf_curve):
                cumulative = sum(mf_curve[:age + 1])
                mf_balance += cohort_amount * cumulative

        sf_balances[m_idx] = round(sf_balance, 2)
        mf_balances[m_idx] = round(mf_balance, 2)

    # Monthly NHC yield: balance × weighted-avg rate / 12
    sf_nhc_yield = [0.0] * num_months
    mf_nhc_yield = [0.0] * num_months

    for m_idx in range(num_months):
        sf_y = 0.0
        mf_y = 0.0
        for (cohort_start, cohort_amount, rate) in sf_cohort_rates:
            age = m_idx - cohort_start
            if 0 <= age < len(sf_curve):
                cumulative = sum(sf_curve[:age + 1])
                sf_y += cohort_amount * cumulative * (rate / 12.0)
        for (cohort_start, cohort_amount, rate) in mf_cohort_rates:
            age = m_idx - cohort_start
            if 0 <= age < len(mf_curve):
                cumulative = sum(mf_curve[:age + 1])
                mf_y += cohort_amount * cumulative * (rate / 12.0)
        sf_nhc_yield[m_idx] = round(sf_y, 2)
        mf_nhc_yield[m_idx] = round(mf_y, 2)

    return {
        "sf_balances": sf_balances,
        "mf_balances": mf_balances,
        "sf_originations": sf_originations,
        "mf_originations": mf_originations,
        "sf_nhc_yield": sf_nhc_yield,
        "mf_nhc_yield": mf_nhc_yield,
        "months": [m.isoformat() for m in months]
    }
