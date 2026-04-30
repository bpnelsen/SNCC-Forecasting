from datetime import date
from dateutil.relativedelta import relativedelta


def calculate_lb(projects: list, monthly_assumptions: dict, num_months: int = 12) -> dict:
    """
    For each project x month:
    EOM = prior_balance + dev_cost_increase - lot_paydown_amount
    Returns: {per_project: {project_id: [balances]}, per_builder: {builder: [balances]}, totals: [balances]}
    """
    today = date.today()
    start_month = today.replace(day=1)
    months = [start_month + relativedelta(months=m) for m in range(num_months)]

    per_project = {}
    per_builder = {}
    totals = [0.0] * num_months

    for project in projects:
        pid = project.id
        builder = project.builder or "Unknown"
        current_balance = project.current_balance or 0.0

        # Get monthly assumptions for this project
        project_monthly = monthly_assumptions.get(pid, {})

        balances = []
        balance = current_balance

        for m_idx, month in enumerate(months):
            month_key = month.isoformat()
            month_data = project_monthly.get(month_key, {})

            dev_cost_increase = month_data.get("dev_cost_increase", 0.0) or 0.0
            lot_paydown_amount = month_data.get("lot_paydown_amount", 0.0) or 0.0

            if m_idx == 0:
                balance = current_balance + dev_cost_increase - lot_paydown_amount
            else:
                balance = balance + dev_cost_increase - lot_paydown_amount

            balance = max(balance, 0.0)
            balances.append(round(balance, 2))

        per_project[pid] = {
            "project_id": pid,
            "project_name": project.project_name,
            "builder": builder,
            "dept_code": project.dept_code,
            "balances": balances,
            "months": [m.isoformat() for m in months]
        }

        # Aggregate by builder
        if builder not in per_builder:
            per_builder[builder] = [0.0] * num_months
        for m_idx, b in enumerate(balances):
            per_builder[builder][m_idx] += b

        # Aggregate totals
        for m_idx, b in enumerate(balances):
            totals[m_idx] += b

    # Round
    for builder in per_builder:
        per_builder[builder] = [round(v, 2) for v in per_builder[builder]]
    totals = [round(v, 2) for v in totals]

    return {
        "per_project": per_project,
        "per_builder": per_builder,
        "totals": totals,
        "months": [m.isoformat() for m in months]
    }
