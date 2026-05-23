"""FastAPI 应用 - 提供 REST API 供 Node.js 前端调用"""
from fastapi import FastAPI, Query, Depends
from sqlalchemy.orm import Session
from typing import Optional
from ..db.database import SessionLocal, PriceRecord, AlertRecord, init_db, get_db_url

app = FastAPI(title="aiquant API", version="0.1.0")


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/")
async def root():
    return {"name": "aiquant API", "version": "0.1.0", "database": get_db_url()}


@app.get("/api/price-records")
async def list_price_records(
    code: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
):
    query = session.query(PriceRecord).order_by(PriceRecord.recorded_at.desc())
    if code:
        query = query.filter(PriceRecord.code == code)
    records = query.limit(limit).all()
    return [
        {"id": r.id, "code": r.code, "name": r.name,
         "price": r.price, "recorded_at": r.recorded_at.isoformat()}
        for r in records
    ]


@app.get("/api/alert-records")
async def list_alert_records(
    code: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    session: Session = Depends(get_session),
):
    query = session.query(AlertRecord).order_by(AlertRecord.created_at.desc())
    if code:
        query = query.filter(AlertRecord.code == code)
    records = query.limit(limit).all()
    return [
        {"id": r.id, "code": r.code, "name": r.name,
         "current_price": r.current_price,
         "trigger_price": r.trigger_price,
         "message": r.message,
         "created_at": r.created_at.isoformat()}
        for r in records
    ]


@app.get("/api/stocks")
async def list_stocks(session: Session = Depends(get_session)):
    records = session.query(PriceRecord.code, PriceRecord.name).distinct().all()
    return [{"code": r[0], "name": r[1]} for r in records]


@app.get("/api/latest-prices")
async def get_latest_prices(session: Session = Depends(get_session)):
    from sqlalchemy import func
    sub = (
        session.query(PriceRecord.code, func.max(PriceRecord.recorded_at).label("max_at"))
        .group_by(PriceRecord.code)
        .subquery()
    )
    records = (
        session.query(PriceRecord)
        .join(sub, (PriceRecord.code == sub.c.code) & (PriceRecord.recorded_at == sub.c.max_at))
        .all()
    )
    return [
        {"code": r.code, "name": r.name, "price": r.price,
         "recorded_at": r.recorded_at.isoformat()}
        for r in records
    ]
