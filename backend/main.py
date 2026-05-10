from fastapi import FastAPI, HTTPException, Query, Request, UploadFile, File, Header, BackgroundTasks, Body
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

COMPANY_TABLE = "master_companies"

COMPANY_SORT_COLS = {
    "legal_name": "legal_name",
    "country": "country",
    "registration_date": "registration_date",
    "employees_max": "COALESCE(employees_max, 0)",
}

EDITABLE_COMPANY_FIELDS = {
    "legal_name", "dba_name", "country", "industry_code", "industry_description",
    "status", "is_active", "registration_date", "dissolution_date",
    "address_line1", "address_line2", "address_city", "address_state",
    "address_postal_code", "address_country", "business_number",
    "employees_min", "employees_max", "entity_structure", "business_type",
    "company_url", "industry_system",
}

# In-memory import job tracker
import_jobs: dict = {}


@app.on_event("startup")
async def setup_db():
    if not engine:
        return
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS company_edits (
                    id SERIAL PRIMARY KEY,
                    company_id VARCHAR NOT NULL,
                    field_name VARCHAR NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    editor_note TEXT,
                    edited_at TIMESTAMP DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_companies (
                    id SERIAL PRIMARY KEY,
                    company_id VARCHAR NOT NULL UNIQUE,
                    legal_name VARCHAR NOT NULL,
                    dba_name VARCHAR,
                    country VARCHAR NOT NULL,
                    industry_code VARCHAR,
                    industry_system VARCHAR DEFAULT 'OTHER',
                    industry_description VARCHAR,
                    status VARCHAR,
                    is_active BOOLEAN DEFAULT TRUE,
                    registration_date DATE,
                    dissolution_date DATE,
                    address_line1 VARCHAR,
                    address_line2 VARCHAR,
                    address_city VARCHAR,
                    address_state VARCHAR,
                    address_postal_code VARCHAR,
                    address_country VARCHAR,
                    business_number VARCHAR,
                    employees_min FLOAT,
                    employees_max FLOAT,
                    entity_structure VARCHAR,
                    business_type VARCHAR,
                    company_url VARCHAR,
                    original_language VARCHAR DEFAULT 'en',
                    source_dataset VARCHAR DEFAULT 'USER_ADDED',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """))
    except Exception as e:
        print(f"DB setup error: {e}")

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


COMPANY_SELECT = f"""
    SELECT company_id, legal_name, dba_name, country, industry_code,
           industry_description, status, is_active, registration_date,
           dissolution_date, address_city, address_state, address_country,
           employees_min, employees_max, entity_structure, business_type,
           company_url, source_dataset, address_line1, address_postal_code,
           business_number, original_language, address_line2, industry_system
    FROM {COMPANY_TABLE}
"""


def row_to_company_dict(r):
    if not r:
        return None
    return {
        "company_id": r[0], "legal_name": r[1], "dba_name": r[2],
        "country": r[3], "industry_code": r[4], "industry_description": r[5],
        "status": r[6], "is_active": r[7],
        "registration_date": str(r[8]) if r[8] else None,
        "dissolution_date": str(r[9]) if r[9] else None,
        "address_city": r[10], "address_state": r[11], "address_country": r[12],
        "employees_min": r[13], "employees_max": r[14],
        "entity_structure": r[15], "business_type": r[16],
        "company_url": r[17], "source_dataset": r[18],
        "address_line1": r[19], "address_postal_code": r[20],
        "business_number": r[21], "original_language": r[22],
        "address_line2": r[23], "industry_system": r[24],
    }


def build_companies_where(q=None, country=None, industry=None, is_active=None, source_dataset=None):
    conditions, params = [], {}
    if q:
        conditions.append("(legal_name ILIKE :q OR dba_name ILIKE :q OR address_city ILIKE :q)")
        params["q"] = f"%{q}%"
    if country:
        conditions.append("country = :country")
        params["country"] = country
    if industry:
        conditions.append("industry_description ILIKE :industry")
        params["industry"] = f"%{industry}%"
    if is_active is not None:
        conditions.append("is_active = :is_active")
        params["is_active"] = is_active
    if source_dataset:
        conditions.append("source_dataset = :source_dataset")
        params["source_dataset"] = source_dataset
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where, params

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
# COMPANY ENDPOINTS
# =============================================================================

USER_COMPANIES_TABLE = "user_companies"

# Column list identical for both master and user_companies tables (required for UNION ALL)
_COMPANY_COLS = """company_id, legal_name, dba_name, country, industry_code,
           industry_description, status, is_active, registration_date,
           dissolution_date, address_city, address_state, address_country,
           employees_min, employees_max, entity_structure, business_type,
           company_url, source_dataset, address_line1, address_postal_code,
           business_number, original_language, address_line2, industry_system"""


@app.get("/api/companies/stats")
async def get_company_stats():
    if not SessionLocal:
        return {"total_companies": 0, "by_country": {"UK": None, "USA": None, "Canada": None}}
    try:
        db = SessionLocal()
        master_total = db.execute(
            text("SELECT reltuples::bigint FROM pg_class WHERE relname = :tbl"),
            {"tbl": COMPANY_TABLE}
        ).scalar() or 0
        user_total = 0
        try:
            user_total = db.execute(text(f"SELECT COUNT(*) FROM {USER_COMPANIES_TABLE}")).scalar() or 0
        except Exception:
            pass
        total = int(master_total) + int(user_total)
        # by_country: use sampling to avoid full scan on 7.4M rows
        by_country = {"UK": None, "USA": None, "Canada": None}
        try:
            rows = db.execute(
                text(f"SELECT country, COUNT(*) AS cnt FROM {COMPANY_TABLE} GROUP BY country")
            ).fetchall()
            by_country = {r[0]: int(r[1]) for r in rows if r[0]}
        except Exception:
            pass
        db.close()
        return {"total_companies": total, "by_country": by_country}
    except Exception as e:
        return {"total_companies": 0, "by_country": {"UK": None, "USA": None, "Canada": None}, "error": str(e)}


@app.get("/api/companies/filters")
async def get_company_filters():
    # Return known static markets — no full table scan needed
    return {
        "countries": ["Canada", "UK", "USA"],
        "source_datasets": [],
    }


@app.get("/api/companies/search")
async def search_companies(
    q: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    source_dataset: Optional[str] = Query(None),
    sort_by: str = Query("legal_name"),
    sort_order: str = Query("asc"),
    page: int = Query(1, ge=1, le=500),
    limit: int = Query(25, ge=1, le=100),
):
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="Database not configured")
    db = SessionLocal()
    try:
        where, params = build_companies_where(q, country, industry, is_active, source_dataset)
        col = COMPANY_SORT_COLS.get(sort_by, "legal_name")
        order = "ASC" if sort_order.lower() != "desc" else "DESC"
        offset = (page - 1) * limit

        # Fetch one extra row to detect whether more pages exist — avoids COUNT(*) scan
        fetch_limit = limit + 1
        union_query = f"""
            SELECT {_COMPANY_COLS} FROM {COMPANY_TABLE} {where}
            UNION ALL
            SELECT {_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} {where}
            ORDER BY {col} {order} NULLS LAST
            LIMIT :limit OFFSET :offset
        """
        rows = db.execute(text(union_query), {**params, "limit": fetch_limit, "offset": offset}).fetchall()
        has_more = len(rows) == fetch_limit
        rows = rows[:limit]

        has_filters = bool(where)
        if not has_filters:
            master_total = db.execute(
                text("SELECT reltuples::bigint FROM pg_class WHERE relname = :tbl"),
                {"tbl": COMPANY_TABLE}
            ).scalar() or 0
            user_total = db.execute(text(f"SELECT COUNT(*) FROM {USER_COMPANIES_TABLE}")).scalar() or 0
            total = int(master_total) + int(user_total)
            is_estimate = True
        else:
            # Derive total from what we fetched — no second COUNT(*) scan
            if not has_more:
                total = offset + len(rows)
                is_estimate = False
            else:
                # Still pages left: show a floor estimate, update on last page
                total = offset + limit + 1
                is_estimate = True

        total_pages = max(1, (total + limit - 1) // limit)
        # If we know there are more pages but estimate undershoots, ensure next page is reachable
        if has_more and total_pages <= page:
            total_pages = page + 1

        return {
            "data": [row_to_company_dict(r) for r in rows],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": int(total),
                "total_pages": total_pages,
                "is_estimate": is_estimate,
            },
        }
    except Exception as e:
        print(f"ERROR /api/companies/search: {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail=f"{type(e).__name__}: {str(e)}")
    finally:
        db.close()


@app.post("/api/admin/create-indexes")
async def create_search_indexes(background_tasks: BackgroundTasks):
    """One-time endpoint: creates pg_trgm indexes on master_companies for fast ILIKE search.
    Runs CONCURRENTLY so the table stays readable. Takes ~5-15 min on 7M rows."""
    if not engine:
        raise HTTPException(status_code=503, detail="Database not configured")

    def _build():
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
                conn.commit()
            with engine.connect() as conn:
                conn.execute(text(f"""
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mc_legal_name_trgm
                    ON {COMPANY_TABLE} USING gin(legal_name gin_trgm_ops)
                """))
                conn.commit()
            with engine.connect() as conn:
                conn.execute(text(f"""
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mc_country
                    ON {COMPANY_TABLE}(country)
                """))
                conn.commit()
            with engine.connect() as conn:
                conn.execute(text(f"""
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mc_is_active
                    ON {COMPANY_TABLE}(is_active)
                """))
                conn.commit()
            print("INDEX CREATION COMPLETE")
        except Exception as e:
            print(f"INDEX CREATION ERROR: {e}")

    background_tasks.add_task(_build)
    return {"status": "started", "message": "Index creation running in background. Check server logs for completion (~5-15 min)."}


@app.get("/api/companies/export/csv")
async def export_companies_csv(
    q: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    source_dataset: Optional[str] = Query(None),
    sort_by: str = Query("legal_name"),
    sort_order: str = Query("asc"),
):
    db_gen = get_db()
    db: Session = next(db_gen)
    try:
        where, params = build_companies_where(q, country, industry, is_active, source_dataset)
        col = COMPANY_SORT_COLS.get(sort_by, "legal_name")
        order = "ASC" if sort_order.lower() != "desc" else "DESC"

        union_query = f"""
            SELECT {_COMPANY_COLS} FROM {COMPANY_TABLE} {where}
            UNION ALL
            SELECT {_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} {where}
            ORDER BY {col} {order} NULLS LAST LIMIT 10000
        """
        rows = db.execute(text(union_query), params).fetchall()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Company ID", "Legal Name", "DBA Name", "Country", "Industry Code",
            "Industry Description", "Status", "Is Active", "Registration Date",
            "Dissolution Date", "City", "State/Province", "Address Country",
            "Employees Min", "Employees Max", "Entity Structure", "Business Type",
            "Website", "Source Dataset", "Address Line 1", "Postal Code",
            "Business Number", "Language", "Address Line 2", "Industry System",
        ])
        for r in rows:
            writer.writerow([
                r[0] or "", r[1] or "", r[2] or "", r[3] or "", r[4] or "",
                r[5] or "", r[6] or "", r[7], str(r[8]) if r[8] else "",
                str(r[9]) if r[9] else "", r[10] or "", r[11] or "", r[12] or "",
                r[13] if r[13] is not None else "", r[14] if r[14] is not None else "",
                r[15] or "", r[16] or "", r[17] or "", r[18] or "",
                r[19] or "", r[20] or "", r[21] or "", r[22] or "",
                r[23] or "", r[24] or "",
            ])

        filename = f"l2b_companies_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    finally:
        db.close()


@app.get("/api/companies/{company_id}/history")
async def get_company_history(company_id: str):
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="Database not configured")
    db = SessionLocal()
    try:
        rows = db.execute(
            text("""
                SELECT id, field_name, old_value, new_value, editor_note, edited_at
                FROM company_edits WHERE company_id = :cid
                ORDER BY edited_at DESC LIMIT 100
            """),
            {"cid": company_id}
        ).fetchall()
        return {
            "company_id": company_id,
            "edits": [
                {"id": r[0], "field": r[1], "old_value": r[2], "new_value": r[3],
                 "note": r[4], "edited_at": str(r[5])}
                for r in rows
            ],
        }
    finally:
        db.close()


def _apply_edits_overlay(base_dict: dict, db) -> dict:
    """Merge latest company_edits overrides onto a base company dict."""
    try:
        overrides = db.execute(
            text("""
                SELECT DISTINCT ON (field_name) field_name, new_value
                FROM company_edits WHERE company_id = :cid
                ORDER BY field_name, edited_at DESC
            """),
            {"cid": base_dict["company_id"]}
        ).fetchall()
        overridden = []
        for field, val in overrides:
            if field in base_dict:
                base_dict[field] = val
                overridden.append(field)
        base_dict["_overridden_fields"] = overridden
    except Exception:
        base_dict["_overridden_fields"] = []
    return base_dict


@app.get("/api/companies/{company_id}")
async def get_company(company_id: str):
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="Database not configured")
    db = SessionLocal()
    try:
        # Check user_companies first (user-added records)
        row = db.execute(
            text(f"SELECT {_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} WHERE company_id = :cid"),
            {"cid": company_id}
        ).fetchone()
        if row:
            d = row_to_company_dict(row)
            d["_overridden_fields"] = []
            d["_is_user_record"] = True
            return d

        # Fall back to master table + apply edits overlay
        row = db.execute(
            text(f"SELECT {_COMPANY_COLS} FROM {COMPANY_TABLE} WHERE company_id = :cid"),
            {"cid": company_id}
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Company not found")
        d = row_to_company_dict(row)
        d["_is_user_record"] = False
        return _apply_edits_overlay(d, db)
    finally:
        db.close()


@app.put("/api/companies/{company_id}")
async def update_company(
    company_id: str,
    updates: dict = Body(...),
):
    """Edit a company record. For master records, changes go to company_edits only
    (original data is never modified). For user-added records, updates in-place."""
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="Database not configured")

    invalid = set(updates.keys()) - EDITABLE_COMPANY_FIELDS
    if invalid:
        raise HTTPException(status_code=400, detail=f"Non-editable fields: {', '.join(invalid)}")
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    db = SessionLocal()
    try:
        # Check if it's a user-added record (can be updated directly)
        is_user = db.execute(
            text(f"SELECT 1 FROM {USER_COMPANIES_TABLE} WHERE company_id = :cid"),
            {"cid": company_id}
        ).fetchone() is not None

        if is_user:
            set_clause = ", ".join(f"{f} = :{f}" for f in updates.keys())
            db.execute(
                text(f"UPDATE {USER_COMPANIES_TABLE} SET {set_clause} WHERE company_id = :cid"),
                {**updates, "cid": company_id}
            )
            db.commit()
            row = db.execute(
                text(f"SELECT {_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} WHERE company_id = :cid"),
                {"cid": company_id}
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Company not found")
            d = row_to_company_dict(row)
            d["_overridden_fields"] = []
            d["_is_user_record"] = True
            return d

        # Master record: get current values for audit, write to company_edits only
        cols_str = ", ".join(updates.keys())
        current = db.execute(
            text(f"SELECT {cols_str} FROM {COMPANY_TABLE} WHERE company_id = :cid"),
            {"cid": company_id}
        ).fetchone()
        if not current:
            raise HTTPException(status_code=404, detail="Company not found")

        current_dict = dict(zip(updates.keys(), current))
        for field, new_val in updates.items():
            old_val = current_dict.get(field)
            db.execute(
                text("""INSERT INTO company_edits
                        (company_id, field_name, old_value, new_value)
                        VALUES (:cid, :f, :o, :n)"""),
                {
                    "cid": company_id, "f": field,
                    "o": str(old_val) if old_val is not None else None,
                    "n": str(new_val) if new_val is not None else None,
                }
            )
        db.commit()

        # Return effective merged data
        row = db.execute(
            text(f"SELECT {_COMPANY_COLS} FROM {COMPANY_TABLE} WHERE company_id = :cid"),
            {"cid": company_id}
        ).fetchone()
        d = row_to_company_dict(row)
        d["_is_user_record"] = False
        return _apply_edits_overlay(d, db)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/companies")
async def create_company(data: dict = Body(...)):
    """Add a new company record. Goes to user_companies table, never touches master data."""
    if not data.get("legal_name") or not data.get("country"):
        raise HTTPException(status_code=400, detail="legal_name and country are required")
    if not SessionLocal:
        raise HTTPException(status_code=503, detail="Database not configured")

    company_id = data.get("company_id") or (str(uuid.uuid4()).replace("-", "")[:12].upper())
    allowed = EDITABLE_COMPANY_FIELDS | {"company_id"}
    clean = {k: v for k, v in data.items() if k in allowed and v not in (None, "")}
    clean["company_id"] = company_id
    clean.setdefault("is_active", True)
    clean.setdefault("source_dataset", "USER_ADDED")
    clean.setdefault("original_language", "en")
    clean.setdefault("industry_system", "OTHER")

    db = SessionLocal()
    try:
        cols = ", ".join(clean.keys())
        vals = ", ".join(f":{k}" for k in clean.keys())
        db.execute(text(f"INSERT INTO {USER_COMPANIES_TABLE} ({cols}) VALUES ({vals})"), clean)
        db.commit()
        row = db.execute(
            text(f"SELECT {_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} WHERE company_id = :cid"),
            {"cid": company_id}
        ).fetchone()
        d = row_to_company_dict(row)
        d["_overridden_fields"] = []
        d["_is_user_record"] = True
        return d
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


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
