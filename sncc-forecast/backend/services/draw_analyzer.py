from datetime import date, datetime
from dateutil.relativedelta import relativedelta


def analyze_draws(loans: list, num_months: int = 24) -> dict:
    """
    For each loan, generate array of EOM balances for num_months.
    EOM[0] = current_balance
    EOM[n] = min(EOM[n-1] + monthly_draw_increase, projected_balance)
    After maturity month, balance = 0
    Returns dict keyed by loan_number with monthly balance arrays
    """
    today = date.today()
    start_month = today.replace(day=1)

    result = {}

    for loan in loans:
        loan_id = loan.loan_number or str(loan.id)
        current_balance = loan.current_balance or 0.0
        monthly_draw = loan.monthly_draw_increase or 0.0
        projected_balance = loan.projected_balance or loan.loan_amount or current_balance
        maturity = loan.maturity_date

        balances = []
        balance = current_balance

        for m in range(num_months):
            month_date = start_month + relativedelta(months=m)

            # Check if past maturity
            if maturity and month_date.replace(day=1) > maturity.replace(day=1) if isinstance(maturity, date) else False:
                balance = 0.0
            else:
                if m == 0:
                    balance = current_balance
                else:
                    balance = min(balance + monthly_draw, projected_balance)
                    if balance < 0:
                        balance = 0.0

            balances.append(round(balance, 2))

        result[loan_id] = {
            "loan_id": loan.id,
            "loan_number": loan.loan_number,
            "loan_type": loan.loan_type,
            "balances": balances,
            "months": [(start_month + relativedelta(months=m)).isoformat() for m in range(num_months)]
        }

    return result
