from fastapi import FastAPI, HTTPException, Query, Request, UploadFile, File, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from typing import Optional
import os
from pathlib import Path
from dotenv import load_dotenv
import csv
import io
from datetime import datetime
import uuid
import unicodedata

load_dotenv()

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================

def get_database_url():
    def extract_url(value):
        if not value:
            return None
        value = value.strip('"\'')
        if '=' in value:
            parts = value.split('=', 1)
            url_part = parts[-1].strip().strip('"\'')
            if '://' in url_part:
                return url_part
            if '://' in value:
                return value
            return None
        return value

    for key in ("DATABASE_URL", "Database_URL", "POSTGRES_URL", "PGDATABASE_URL"):
        val = os.environ.get(key)
        if val:
            extracted = extract_url(val)
            if extracted:
                return extracted

    for key, value in os.environ.items():
        if "POSTGRES" in key.upper() and "URL" in key.upper():
            if "proxy.rlwy.net" in value or "railway.internal" in value:
                extracted = extract_url(value)
                if extracted:
                    return extracted

    return None

DATABASE_URL = get_database_url()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "l2b-admin-2025")

# SQLAlchemy 2.x requires postgresql:// not postgres://
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    print(f"Database connected: {DATABASE_URL[:40]}...")
else:
    print("ERROR: DATABASE_URL not found")
    engine = None
    SessionLocal = None

# =============================================================================
# APP SETUP
# =============================================================================

app = FastAPI(
    title="L2B.click EU Tender Intelligence",
    description="Search EU procurement buyers and suppliers",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

if os.getenv("ENVIRONMENT") == "production":
    app.add_middleware(HTTPSRedirectMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["l2b.click", "www.l2b.click"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    if os.getenv("ENVIRONMENT") == "production":
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# =============================================================================
# CONSTANTS
# =============================================================================

ACTIVITY_LABELS = {
    "AIRPORT": "Airport",
    "COAL_AND_OTHER_EXTRACTION": "Coal & Extraction",
    "DEFENCE": "Defence",
    "ECONOMIC_AND_FINANCIAL_AFFAIRS": "Economic & Financial",
    "EDUCATION": "Education",
    "ELECTRICITY": "Electricity",
    "ENVIRONMENT": "Environment",
    "GAS_AND_HEAT_PRODUCTION": "Gas & Heat Production",
    "GAS_AND_OIL_EXTRACTION": "Gas & Oil Extraction",
    "GENERAL_PUBLIC_SERVICES": "General Public Services",
    "HEALTH": "Health",
    "HOUSING_AND_COMMUNITY_AMENITIES": "Housing & Community",
    "OTHER": "Other",
    "PORT": "Port",
    "POSTAL": "Postal",
    "PUBLIC_ORDER_AND_SAFETY": "Public Order & Safety",
    "RAILWAY": "Railway",
    "RECREATION_CULTURE_AND_RELIGION": "Recreation & Culture",
    "SOCIAL_PROTECTION": "Social Protection",
    "URBAN_TRANSPORT": "Urban Transport",
    "WATER": "Water",
}

ACTIVITIES = sorted(ACTIVITY_LABELS.keys())

BUYER_SORT_COLS = {
    "total_budget_spent_eur": "total_budget_spent_eur",
    "total_tenders_issued": "total_tenders_issued",
    "buyer_name": "buyer_name",
}

SUPPLIER_SORT_COLS = {
    "lifetime_revenue_eur": "lifetime_revenue_eur",
    "total_contracts_won": "total_contracts_won",
    "bidder_name": "bidder_name",
}

# In-memory import job tracker
import_jobs: dict = {}

# =============================================================================
# HELPERS
# =============================================================================

def get_db():
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="Database not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def build_buyers_where(q: Optional[str], country: Optional[str], activity: Optional[str]):
    conditions, params = [], {}
    if q:
        conditions.append("(buyer_name ILIKE :q OR buyer_city ILIKE :q)")
        params["q"] = f"%{q}%"
    if country:
        conditions.append("buyer_country = :country")
        params["country"] = country
    if activity:
        conditions.append("buyer_mainActivities ILIKE :activity")
        params["activity"] = f"%{activity}%"
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where, params

def build_suppliers_where(q: Optional[str], country: Optional[str]):
    conditions, params = [], {}
    if q:
        conditions.append("bidder_name ILIKE :q")
        params["q"] = f"%{q}%"
    if country:
        conditions.append("bidder_country = :country")
        params["country"] = country
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where, params

def ascii_safe(text, max_len=60):
    """Normalize to ASCII for PDF output."""
    if text is None:
        return ""
    s = unicodedata.normalize("NFKD", str(text))
    s = s.encode("ascii", "ignore").decode("ascii")
    return s[:max_len]

def format_eur(value) -> str:
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        return "N/A"
    if v >= 1_000_000_000:
        return f"EUR {v/1_000_000_000:.1f}B"
    if v >= 1_000_000:
        return f"EUR {v/1_000_000:.1f}M"
    if v >= 1_000:
        return f"EUR {v/1_000:.0f}K"
    return f"EUR {v:.0f}"

def require_admin(x_admin_password: str = Header(None)):
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/health")
async def health_check():
    if not SessionLocal:
        return {"status": "unhealthy", "error": "No DATABASE_URL configured"}
    db = SessionLocal()
    try:
        # List all tables in the public schema
        tables = db.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
        ).fetchall()
        table_names = [r[0] for r in tables]

        # Try counting from our expected table names
        counts = {}
        for tbl in table_names:
            try:
                n = db.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                counts[tbl] = n
            except Exception:
                counts[tbl] = "error"

        return {
            "status": "healthy",
            "database": "connected",
            "tables": table_names,
            "row_counts": counts,
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
    finally:
        db.close()


@app.get("/api/stats")
async def get_stats():
    try:
        db = SessionLocal()
        total_buyers = db.execute(text("SELECT COUNT(*) FROM buyers")).scalar()
        total_suppliers = db.execute(text("SELECT COUNT(*) FROM suppliers")).scalar()
        buyer_countries = db.execute(
            text("SELECT COUNT(DISTINCT buyer_country) FROM buyers WHERE buyer_country ~ '^[A-Z]{2}$'")
        ).scalar()
        db.close()
        return {
            "total_buyers": total_buyers,
            "total_suppliers": total_suppliers,
            "total_countries": buyer_countries,
        }
    except Exception as e:
        return {"total_buyers": 0, "total_suppliers": 0, "total_countries": 0, "error": str(e)}


@app.get("/api/filters")
async def get_filters():
    """Return available country codes and activity types for dropdowns."""
    try:
        db = SessionLocal()
        buyer_countries = db.execute(
            text("SELECT DISTINCT buyer_country FROM buyers WHERE buyer_country ~ '^[A-Z]{2}$' ORDER BY buyer_country")
        ).fetchall()
        supplier_countries = db.execute(
            text("SELECT DISTINCT bidder_country FROM suppliers WHERE bidder_country ~ '^[A-Z]{2}$' ORDER BY bidder_country")
        ).fetchall()
        db.close()
        return {
            "buyer_countries": [r[0] for r in buyer_countries],
            "supplier_countries": [r[0] for r in supplier_countries],
            "activities": ACTIVITIES,
            "activity_labels": ACTIVITY_LABELS,
        }
    except Exception as e:
        return {"buyer_countries": [], "supplier_countries": [], "activities": ACTIVITIES, "activity_labels": ACTIVITY_LABELS}


# ─── Buyers search ────────────────────────────────────────────────────────────

@app.get("/api/buyers/search")
async def search_buyers(
    q: Optional[str] = Query(None, description="Search by name or city"),
    country: Optional[str] = Query(None, description="2-letter ISO country code"),
    activity: Optional[str] = Query(None, description="Main activity sector"),
    sort_by: str = Query("total_budget_spent_eur", description="Sort column"),
    sort_order: str = Query("desc", description="asc or desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="Database not configured")
    db = SessionLocal()
    try:
        where, params = build_buyers_where(q, country, activity)
        col = BUYER_SORT_COLS.get(sort_by, "total_budget_spent_eur")
        order = "DESC" if sort_order.lower() != "asc" else "ASC"
        offset = (page - 1) * limit

        rows = db.execute(
            text(f"""
                SELECT buyer_name, buyer_country, buyer_city,
                       buyer_mainActivities, total_tenders_issued, total_budget_spent_eur
                FROM buyers {where}
                ORDER BY {col} {order}
                LIMIT :limit OFFSET :offset
            """),
            {**params, "limit": limit, "offset": offset},
        ).fetchall()

        total = db.execute(text(f"SELECT COUNT(*) FROM buyers {where}"), params).scalar()

        data = [
            {
                "buyer_name": r[0],
                "buyer_country": r[1],
                "buyer_city": r[2],
                "buyer_mainActivities": r[3],
                "total_tenders_issued": r[4],
                "total_budget_spent_eur": r[5],
            }
            for r in rows
        ]

        return {
            "data": data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": max(1, (total + limit - 1) // limit),
            },
        }
    except Exception as e:
        print(f"ERROR /api/buyers/search: {e}")
        raise HTTPException(status_code=503, detail=f"Database error: {str(e)}")
    finally:
        db.close()


# ─── Suppliers search ─────────────────────────────────────────────────────────

@app.get("/api/suppliers/search")
async def search_suppliers(
    q: Optional[str] = Query(None, description="Search by company name"),
    country: Optional[str] = Query(None, description="2-letter ISO country code"),
    sort_by: str = Query("lifetime_revenue_eur", description="Sort column"),
    sort_order: str = Query("desc", description="asc or desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
):
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="Database not configured")
    db = SessionLocal()
    try:
        where, params = build_suppliers_where(q, country)
        col = SUPPLIER_SORT_COLS.get(sort_by, "lifetime_revenue_eur")
        order = "DESC" if sort_order.lower() != "asc" else "ASC"
        offset = (page - 1) * limit

        rows = db.execute(
            text(f"""
                SELECT bidder_name, bidder_country, total_contracts_won, lifetime_revenue_eur
                FROM suppliers {where}
                ORDER BY {col} {order}
                LIMIT :limit OFFSET :offset
            """),
            {**params, "limit": limit, "offset": offset},
        ).fetchall()

        total = db.execute(text(f"SELECT COUNT(*) FROM suppliers {where}"), params).scalar()

        data = [
            {
                "bidder_name": r[0],
                "bidder_country": r[1],
                "total_contracts_won": r[2],
                "lifetime_revenue_eur": r[3],
            }
            for r in rows
        ]

        return {
            "data": data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": max(1, (total + limit - 1) // limit),
            },
        }
    except Exception as e:
        print(f"ERROR /api/suppliers/search: {e}")
        raise HTTPException(status_code=503, detail=f"Database error: {str(e)}")
    finally:
        db.close()


# =============================================================================
# EXPORT ENDPOINTS
# =============================================================================

@app.get("/api/buyers/export/csv")
async def export_buyers_csv(
    q: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    activity: Optional[str] = Query(None),
    sort_by: str = Query("total_budget_spent_eur"),
    sort_order: str = Query("desc"),
):
    db_gen = get_db()
    db: Session = next(db_gen)
    try:
        where, params = build_buyers_where(q, country, activity)
        col = BUYER_SORT_COLS.get(sort_by, "total_budget_spent_eur")
        order = "DESC" if sort_order.lower() != "asc" else "ASC"

        rows = db.execute(
            text(f"""
                SELECT buyer_name, buyer_country, buyer_city,
                       buyer_mainActivities, total_tenders_issued, total_budget_spent_eur
                FROM buyers {where}
                ORDER BY {col} {order}
                LIMIT 5000
            """),
            params,
        ).fetchall()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Buyer Name", "Country", "City", "Main Activities",
                          "Tenders Issued", "Total Budget (EUR)"])
        for r in rows:
            writer.writerow([r[0], r[1], r[2], r[3], r[4],
                              round(float(r[5] or 0), 2)])

        filename = f"l2b_buyers_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    finally:
        db.close()


@app.get("/api/suppliers/export/csv")
async def export_suppliers_csv(
    q: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    sort_by: str = Query("lifetime_revenue_eur"),
    sort_order: str = Query("desc"),
):
    db_gen = get_db()
    db: Session = next(db_gen)
    try:
        where, params = build_suppliers_where(q, country)
        col = SUPPLIER_SORT_COLS.get(sort_by, "lifetime_revenue_eur")
        order = "DESC" if sort_order.lower() != "asc" else "ASC"

        rows = db.execute(
            text(f"""
                SELECT bidder_name, bidder_country, total_contracts_won, lifetime_revenue_eur
                FROM suppliers {where}
                ORDER BY {col} {order}
                LIMIT 5000
            """),
            params,
        ).fetchall()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Company Name", "Country", "Contracts Won", "Lifetime Revenue (EUR)"])
        for r in rows:
            writer.writerow([r[0], r[1], r[2], round(float(r[3] or 0), 2)])

        filename = f"l2b_suppliers_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    finally:
        db.close()


@app.get("/api/buyers/export/pdf")
async def export_buyers_pdf(
    q: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    activity: Optional[str] = Query(None),
    sort_by: str = Query("total_budget_spent_eur"),
    sort_order: str = Query("desc"),
):
    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF library not installed")

    db_gen = get_db()
    db: Session = next(db_gen)
    try:
        where, params = build_buyers_where(q, country, activity)
        col = BUYER_SORT_COLS.get(sort_by, "total_budget_spent_eur")
        order = "DESC" if sort_order.lower() != "asc" else "ASC"

        rows = db.execute(
            text(f"""
                SELECT buyer_name, buyer_country, buyer_city,
                       buyer_mainActivities, total_tenders_issued, total_budget_spent_eur
                FROM buyers {where}
                ORDER BY {col} {order}
                LIMIT 500
            """),
            params,
        ).fetchall()
    finally:
        db.close()

    # Build search summary
    parts = []
    if q:
        parts.append(f"Search: {q}")
    if country:
        parts.append(f"Country: {country}")
    if activity:
        parts.append(f"Activity: {ACTIVITY_LABELS.get(activity, activity)}")
    search_summary = " | ".join(parts) if parts else "All buyers"

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()

    # Header
    pdf.set_fill_color(30, 64, 175)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, "L2B.click - EU Tender Buyers", new_x="LMARGIN", new_y="NEXT", align="C", fill=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_fill_color(59, 130, 246)
    pdf.cell(0, 7, f"{search_summary}  |  Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}  |  {len(rows)} records",
             new_x="LMARGIN", new_y="NEXT", align="C", fill=True)
    pdf.ln(4)

    # Table header
    pdf.set_fill_color(30, 64, 175)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8)
    col_w = [78, 18, 38, 48, 24, 42]
    headers = ["Buyer Name", "Country", "City", "Main Activity", "Tenders", "Budget (EUR)"]
    for h, w in zip(headers, col_w):
        pdf.cell(w, 8, h, border=1, fill=True, align="C")
    pdf.ln()

    # Table rows
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 7)
    for i, r in enumerate(rows):
        pdf.set_fill_color(248, 250, 252) if i % 2 == 0 else pdf.set_fill_color(255, 255, 255)
        activity_first = (str(r[3] or "").split(",")[0])
        values = [
            ascii_safe(r[0], 52),
            ascii_safe(r[1], 5),
            ascii_safe(r[2], 25),
            ascii_safe(ACTIVITY_LABELS.get(activity_first, activity_first), 30),
            str(r[4] or 0),
            format_eur(r[5]),
        ]
        for val, w in zip(values, col_w):
            pdf.cell(w, 6, val, border=1, fill=True)
        pdf.ln()

    # Footer
    pdf.set_y(-12)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, f"l2b.click  |  Page {pdf.page_no()}  |  Max 500 rows in PDF export", align="C")

    filename = f"l2b_buyers_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.pdf"
    return Response(
        content=bytes(pdf.output()),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/api/suppliers/export/pdf")
async def export_suppliers_pdf(
    q: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    sort_by: str = Query("lifetime_revenue_eur"),
    sort_order: str = Query("desc"),
):
    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF library not installed")

    db_gen = get_db()
    db: Session = next(db_gen)
    try:
        where, params = build_suppliers_where(q, country)
        col = SUPPLIER_SORT_COLS.get(sort_by, "lifetime_revenue_eur")
        order = "DESC" if sort_order.lower() != "asc" else "ASC"

        rows = db.execute(
            text(f"""
                SELECT bidder_name, bidder_country, total_contracts_won, lifetime_revenue_eur
                FROM suppliers {where}
                ORDER BY {col} {order}
                LIMIT 500
            """),
            params,
        ).fetchall()
    finally:
        db.close()

    parts = []
    if q:
        parts.append(f"Search: {q}")
    if country:
        parts.append(f"Country: {country}")
    search_summary = " | ".join(parts) if parts else "All suppliers"

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()

    pdf.set_fill_color(5, 150, 105)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, "L2B.click - EU Tender Suppliers", new_x="LMARGIN", new_y="NEXT", align="C", fill=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_fill_color(16, 185, 129)
    pdf.cell(0, 7, f"{search_summary}  |  Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}  |  {len(rows)} records",
             new_x="LMARGIN", new_y="NEXT", align="C", fill=True)
    pdf.ln(4)

    pdf.set_fill_color(5, 150, 105)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    col_w = [120, 25, 45, 58]
    headers = ["Company Name", "Country", "Contracts Won", "Lifetime Revenue"]
    for h, w in zip(headers, col_w):
        pdf.cell(w, 8, h, border=1, fill=True, align="C")
    pdf.ln()

    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 8)
    for i, r in enumerate(rows):
        pdf.set_fill_color(240, 253, 250) if i % 2 == 0 else pdf.set_fill_color(255, 255, 255)
        values = [
            ascii_safe(r[0], 80),
            ascii_safe(r[1], 5),
            str(r[2] or 0),
            format_eur(r[3]),
        ]
        for val, w in zip(values, col_w):
            pdf.cell(w, 7, val, border=1, fill=True)
        pdf.ln()

    pdf.set_y(-12)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, f"l2b.click  |  Page {pdf.page_no()}  |  Max 500 rows in PDF export", align="C")

    filename = f"l2b_suppliers_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.pdf"
    return Response(
        content=bytes(pdf.output()),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# =============================================================================
# IMPORT ENDPOINTS
# =============================================================================

BUYER_REQUIRED_COLS = {"buyer_name", "buyer_country"}
SUPPLIER_REQUIRED_COLS = {"bidder_name", "bidder_country"}


def process_import(job_id: str, entity: str, content: bytes):
    """Background task: parse CSV and insert rows into the DB."""
    job = import_jobs[job_id]
    try:
        text_content = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text_content))
        fieldnames = set(reader.fieldnames or [])

        required = BUYER_REQUIRED_COLS if entity == "buyers" else SUPPLIER_REQUIRED_COLS
        missing = required - fieldnames
        if missing:
            job["status"] = "failed"
            job["error"] = f"Missing required columns: {', '.join(missing)}"
            return

        rows = list(reader)
        job["total"] = len(rows)

        db_gen = get_db()
        db: Session = next(db_gen)
        inserted = 0
        errors = []

        try:
            for i, row in enumerate(rows):
                try:
                    if entity == "buyers":
                        db.execute(
                            text("""
                                INSERT INTO buyers
                                    (buyer_name, buyer_country, buyer_city,
                                     buyer_mainActivities, total_tenders_issued, total_budget_spent_eur)
                                VALUES
                                    (:buyer_name, :buyer_country, :buyer_city,
                                     :buyer_mainActivities, :total_tenders_issued, :total_budget_spent_eur)
                            """),
                            {
                                "buyer_name": row.get("buyer_name", ""),
                                "buyer_country": row.get("buyer_country", ""),
                                "buyer_city": row.get("buyer_city") or None,
                                "buyer_mainActivities": row.get("buyer_mainActivities") or None,
                                "total_tenders_issued": int(row.get("total_tenders_issued") or 0),
                                "total_budget_spent_eur": float(row.get("total_budget_spent_eur") or 0),
                            },
                        )
                    else:
                        db.execute(
                            text("""
                                INSERT INTO suppliers
                                    (bidder_name, bidder_country,
                                     total_contracts_won, lifetime_revenue_eur)
                                VALUES
                                    (:bidder_name, :bidder_country,
                                     :total_contracts_won, :lifetime_revenue_eur)
                            """),
                            {
                                "bidder_name": row.get("bidder_name", ""),
                                "bidder_country": row.get("bidder_country", ""),
                                "total_contracts_won": int(row.get("total_contracts_won") or 0),
                                "lifetime_revenue_eur": float(row.get("lifetime_revenue_eur") or 0),
                            },
                        )
                    inserted += 1
                    if inserted % 100 == 0:
                        db.commit()
                        job["processed"] = inserted
                except Exception as row_err:
                    errors.append(f"Row {i+2}: {str(row_err)[:80]}")
                    if len(errors) > 20:
                        errors.append("Too many errors — stopping.")
                        break

            db.commit()
        finally:
            db.close()

        job["status"] = "completed"
        job["processed"] = inserted
        job["errors"] = errors
        job["completed_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)


@app.post("/api/import/upload")
async def import_upload(
    background_tasks: BackgroundTasks,
    entity: str = Query(..., description="'buyers' or 'suppliers'"),
    file: UploadFile = File(...),
    x_admin_password: str = Header(None),
):
    """Upload a CSV file to import buyers or suppliers."""
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    if entity not in ("buyers", "suppliers"):
        raise HTTPException(status_code=400, detail="entity must be 'buyers' or 'suppliers'")

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    job_id = str(uuid.uuid4())
    import_jobs[job_id] = {
        "job_id": job_id,
        "entity": entity,
        "filename": file.filename,
        "status": "processing",
        "processed": 0,
        "total": 0,
        "errors": [],
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
    }

    background_tasks.add_task(process_import, job_id, entity, content)

    return {"job_id": job_id, "status": "processing", "message": "Import started"}


@app.get("/api/import/status/{job_id}")
async def import_status(job_id: str, x_admin_password: str = Header(None)):
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")
    job = import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/import/history")
async def import_history(x_admin_password: str = Header(None)):
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")
    return {
        "jobs": sorted(import_jobs.values(), key=lambda j: j["started_at"], reverse=True)
    }


@app.get("/api/import/template/{entity}")
async def import_template(entity: str):
    """Download a CSV template for import."""
    if entity == "buyers":
        headers = ["buyer_name", "buyer_country", "buyer_city",
                   "buyer_mainActivities", "total_tenders_issued", "total_budget_spent_eur"]
        example = ["Example Hospital", "FR", "Paris", "HEALTH", "25", "5000000.00"]
    elif entity == "suppliers":
        headers = ["bidder_name", "bidder_country", "total_contracts_won", "lifetime_revenue_eur"]
        example = ["Example Corp", "DE", "15", "12500000.00"]
    else:
        raise HTTPException(status_code=400, detail="entity must be 'buyers' or 'suppliers'")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerow(example)

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=l2b_{entity}_template.csv"},
    )


# =============================================================================
# FRONTEND SERVING
# =============================================================================

BACKEND_DIR = Path(__file__).parent
FRONTEND_DIR = BACKEND_DIR / "dist"

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets", html=True), name="assets")


@app.get("/")
async def serve_index():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path, headers={"Cache-Control": "no-cache"})
    return {"message": "L2B.click API — use /docs"}


@app.get("/{path:path}")
async def serve_spa(path: str):
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path, headers={"Cache-Control": "no-cache"})
    return {"error": "Not found"}
