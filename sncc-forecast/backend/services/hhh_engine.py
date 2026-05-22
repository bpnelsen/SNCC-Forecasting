from datetime import date
from dateutil.relativedelta import relativedelta


def calculate_hhh(investments: list, num_months: int = 12) -> dict:
    """
    HH_TOM: EOM[n] = EOM[n-1] - monthly_deduction (until maturity, then 0)
    HHH_OW, HH-JKSN: EOM[n] = EOM[n-1] + monthly_increase (until maturity, then 0)
    Returns: {per_investment: {name: [balances]}, totals: [balances]}
    """
    today = date.today()
    start_month = today.replace(day=1)
    months = [start_month + relativedelta(months=m) for m in range(num_months)]

    per_investment = {}
    totals = [0.0] * num_months

    for inv in investments:
        name = inv.investment_name
        current_balance = inv.current_balance or 0.0
        maturity = inv.maturity_date
        monthly_increase = inv.monthly_increase or 0.0
        monthly_deduction = inv.monthly_deduction or 0.0

        # Determine if this is a decreasing investment
        is_decreasing = "TOM" in (name or "").upper()

        balances = []
        balance = current_balance

        for m_idx, month in enumerate(months):
            # Check maturity
            past_maturity = False
            if maturity:
                mat = maturity if isinstance(maturity, date) else maturity.date()
                if month.replace(day=1) > mat.replace(day=1):
                    past_maturity = True

            if past_maturity:
                balance = 0.0
            else:
                if m_idx == 0:
                    balance = current_balance
                else:
                    if is_decreasing:
                        balance = balance - monthly_deduction
                    else:
                        balance = balance + monthly_increase
                    balance = max(balance, 0.0)

            balances.append(round(balance, 2))

        per_investment[name] = {
            "investment_id": inv.id,
            "investment_name": name,
            "balances": balances,
            "months": [m.isoformat() for m in months]
        }

        for m_idx, b in enumerate(balances):
            totals[m_idx] += b

    totals = [round(v, 2) for v in totals]

    return {
        "per_investment": per_investment,
        "totals": totals,
        "months": [m.isoformat() for m in months]
    }
