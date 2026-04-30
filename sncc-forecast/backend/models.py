from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, JSON, Enum, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class LoanType(str, enum.Enum):
    SFR = "SFR"
    MF = "MF"
    AD = "AD"
    RawLand = "RawLand"
    FinishedLots = "FinishedLots"


class ForecastVersion(Base):
    __tablename__ = "forecast_versions"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    snapshot_date = Column(Date, nullable=True)
    import_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    loans = relationship("Loan", back_populates="version", cascade="all, delete-orphan")
    nhc_assumptions = relationship("NHCAssumption", back_populates="version", cascade="all, delete-orphan")
    draw_curves = relationship("DrawCurve", back_populates="version", cascade="all, delete-orphan")
    lb_projects = relationship("LBProject", back_populates="version", cascade="all, delete-orphan")
    hhh_investments = relationship("HHHInvestment", back_populates="version", cascade="all, delete-orphan")
    profit_sharing_assumptions = relationship("ProfitSharingAssumption", back_populates="version", cascade="all, delete-orphan")


class Loan(Base):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(Integer, ForeignKey("forecast_versions.id"), nullable=False)
    loan_number = Column(String, nullable=True)
    borrower = Column(String, nullable=True)
    loan_program = Column(String, nullable=True)
    loan_type = Column(String, nullable=True)  # SFR/MF/AD/RawLand/FinishedLots
    loan_amount = Column(Float, nullable=True)
    funded_date = Column(Date, nullable=True)
    maturity_date = Column(Date, nullable=True)
    current_balance = Column(Float, nullable=True)
    loan_remaining = Column(Float, nullable=True)
    interest_rate = Column(Float, nullable=True)
    development_name = Column(String, nullable=True)
    subdivision_name = Column(String, nullable=True)
    projected_balance = Column(Float, nullable=True)
    monthly_draw_increase = Column(Float, nullable=True)
    draw_flagged = Column(Boolean, default=False)
    draw_flag_reason = Column(String, nullable=True)

    version = relationship("ForecastVersion", back_populates="loans")


class NHCAssumption(Base):
    __tablename__ = "nhc_assumptions"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(Integer, ForeignKey("forecast_versions.id"), nullable=False)
    development_name = Column(String, nullable=False)
    builder = Column(String, nullable=True)
    forecast_month = Column(Date, nullable=False)
    mf_starts = Column(Integer, default=0)
    sf_starts = Column(Integer, default=0)
    mf_loan_amount = Column(Float, default=0.0)
    sf_loan_amount = Column(Float, default=0.0)
    mf_payoffs = Column(Integer, default=0)
    sf_payoffs = Column(Integer, default=0)
    memorial_amount = Column(Float, default=0.0)

    version = relationship("ForecastVersion", back_populates="nhc_assumptions")


class DrawCurve(Base):
    __tablename__ = "draw_curves"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(Integer, ForeignKey("forecast_versions.id"), nullable=False)
    product_type = Column(String, nullable=False)  # SF or MF
    curve_values = Column(JSON, nullable=False)  # array of 11 floats

    version = relationship("ForecastVersion", back_populates="draw_curves")


class LBProject(Base):
    __tablename__ = "lb_projects"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(Integer, ForeignKey("forecast_versions.id"), nullable=False)
    dept_code = Column(String, nullable=True)
    builder = Column(String, nullable=True)
    project_name = Column(String, nullable=True)
    phase = Column(String, nullable=True)
    total_lots = Column(Integer, nullable=True)
    current_balance = Column(Float, nullable=True)
    total_budget = Column(Float, nullable=True)
    development_costs_remaining = Column(Float, nullable=True)

    version = relationship("ForecastVersion", back_populates="lb_projects")
    monthly_assumptions = relationship("LBMonthlyAssumption", back_populates="lb_project", cascade="all, delete-orphan")


class LBMonthlyAssumption(Base):
    __tablename__ = "lb_monthly_assumptions"

    id = Column(Integer, primary_key=True, index=True)
    lb_project_id = Column(Integer, ForeignKey("lb_projects.id"), nullable=False)
    forecast_month = Column(Date, nullable=False)
    dev_cost_increase = Column(Float, default=0.0)
    lot_paydown_amount = Column(Float, default=0.0)
    lots_released = Column(Integer, default=0)

    lb_project = relationship("LBProject", back_populates="monthly_assumptions")


class HHHInvestment(Base):
    __tablename__ = "hhh_investments"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(Integer, ForeignKey("forecast_versions.id"), nullable=False)
    investment_name = Column(String, nullable=False)
    current_balance = Column(Float, nullable=True)
    loan_amount = Column(Float, nullable=True)
    monthly_increase = Column(Float, default=0.0)
    release_price = Column(Float, nullable=True)
    units_per_month = Column(Integer, default=0)
    monthly_deduction = Column(Float, default=0.0)
    maturity_date = Column(Date, nullable=True)

    version = relationship("ForecastVersion", back_populates="hhh_investments")


class ProfitSharingAssumption(Base):
    __tablename__ = "profit_sharing_assumptions"

    id = Column(Integer, primary_key=True, index=True)
    version_id = Column(Integer, ForeignKey("forecast_versions.id"), nullable=False)
    builder = Column(String, nullable=False)
    product_type = Column(String, nullable=True)
    avg_profit_per_unit = Column(Float, default=0.0)
    forecast_month = Column(Date, nullable=False)
    closings_count = Column(Integer, default=0)

    version = relationship("ForecastVersion", back_populates="profit_sharing_assumptions")
