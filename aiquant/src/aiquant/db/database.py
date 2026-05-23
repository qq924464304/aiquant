"""数据库初始化 - 用于持久化价格和警报记录"""
import os
from sqlalchemy import create_engine, Column, String, Float, DateTime, Integer, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from ..core.config import ROOT_DIR

load_dotenv(ROOT_DIR / ".env")

Base = declarative_base()


class PriceRecord(Base):
    __tablename__ = "price_records"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), nullable=False, index=True)
    name = Column(String(50))
    price = Column(Float, nullable=False)
    pe_ttm = Column(Float)  # 市盈率(TTM)
    pb_mrq = Column(Float)  # 市净率
    recorded_at = Column(DateTime, default=datetime.now, index=True)


class AlertRecord(Base):
    __tablename__ = "alert_records"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), nullable=False, index=True)
    name = Column(String(50))
    current_price = Column(Float, nullable=False)
    trigger_price = Column(Float, nullable=False)
    message = Column(Text)
    created_at = Column(DateTime, default=datetime.now, index=True)


class EtfIndex(Base):
    """ETF指数基本信息"""
    __tablename__ = "etf_indices"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ts_code = Column(String(20), nullable=False,
                     unique=True, index=True, comment="指数代码")
    indx_name = Column(String(100), comment="指数全称")
    indx_csname = Column(String(50), comment="指数简称")
    pub_party_name = Column(String(100), comment="指数发布机构")
    pub_date = Column(String(20), comment="指数发布日期")
    base_date = Column(String(20), comment="指数基日")
    bp = Column(Float, comment="指数基点(点)")
    adj_circle = Column(String(50), comment="指数成份证券调整周期")
    created_at = Column(DateTime, default=datetime.now)


class FinancialRecord(Base):
    """财务数据（季报/年报）"""
    __tablename__ = "financial_records"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    quarter = Column(Integer, nullable=False)  # 1=Q1 2=中报 3=Q3 4=年报

    # 利润表
    roe_avg = Column(Float)  # 净资产收益率(ROE)
    np_margin = Column(Float)  # 净利率
    gp_margin = Column(Float)  # 毛利率
    net_profit = Column(Float)  # 净利润
    eps_ttm = Column(Float)  # 每股收益(TTM)
    mb_revenue = Column(Float)  # 营业总收入

    # 成长能力
    yoy_equity = Column(Float)  # 净资产同比
    yoy_asset = Column(Float)  # 总资产同比
    yoy_ni = Column(Float)  # 净利润同比
    yoy_eps_basic = Column(Float)  # 基本每股收益同比
    yoy_pni = Column(Float)  # 扣非净利润同比

    # 资产负债表
    current_ratio = Column(Float)  # 流动比率
    quick_ratio = Column(Float)  # 速动比率
    cash_ratio = Column(Float)  # 现金比率
    asset_to_equity = Column(Float)  # 权益乘数(总资产/净资产)

    # 现金流量表
    cfo_to_or = Column(Float)  # 经营现金流/营业收入
    cfo_to_np = Column(Float)  # 经营现金流/净利润
    ebit_to_interest = Column(Float)  # 利息保障倍数

    created_at = Column(DateTime, default=datetime.now)


DATABASE_URL = os.getenv(
    "DATABASE_URL", f"sqlite:///{ROOT_DIR / 'data' / 'aiquant.db'}")

engine_kwargs = {}
connect_args = {}
if DATABASE_URL.startswith("postgresql"):
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10
elif DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, echo=False,
                       connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine)


def init_db():
    from aiquant.core.logger import setup_logger
    logger = setup_logger(__name__)
    if DATABASE_URL.startswith("sqlite"):
        (ROOT_DIR / "data").mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    logger.info(f"数据库初始化完成")


def get_db_url():
    url = DATABASE_URL
    if "@" in url and ":" in url.split("@")[0]:
        user = url.split("@")[0].split(":")[0]
        return f"{user}:****@{url.split('@')[1]}"
    return url


def save_price_record(code, name, price, recorded_at=None):
    session = SessionLocal()
    try:
        session.add(PriceRecord(code=code, name=name,
                    price=price, recorded_at=recorded_at or datetime.now()))
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()


def save_alert_record(code, name, current_price, trigger_price, message):
    session = SessionLocal()
    try:
        session.add(AlertRecord(code=code, name=name, current_price=current_price,
                    trigger_price=trigger_price, message=message))
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()
