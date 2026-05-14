from fastapi import FastAPI, HTTPException, Query, Request, UploadFile, File, BackgroundTasks, Body
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
try:
    from fpdf import FPDF
    _FPDF_OK = True
except ImportError:
    _FPDF_OK = False

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
    title="L2B.click Business Intelligence",
    description="Search and manage company data worldwide",
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

COMPANY_TABLE = "master_companies"

COMPANY_SORT_COLS = {
    "legal_name": "legal_name",
    "country": "country",
    "registration_date": "registration_date",
    "employees_max": "employees_max",  # must be a plain column name — UNION ORDER BY forbids expressions
}

EDITABLE_COMPANY_FIELDS = {
    "legal_name", "dba_name", "country", "industry_code", "industry_description",
    "status", "is_active", "registration_date", "dissolution_date",
    "address_line1", "address_line2", "address_city", "address_state",
    "address_postal_code", "address_country", "business_number",
    "employees_min", "employees_max", "entity_structure", "business_type",
    "company_url", "industry_system",
}

@app.on_event("startup")
async def setup_db():
    if not engine:
        return
    _DDL = [
        (
            "company_edits",
            """CREATE TABLE IF NOT EXISTS company_edits (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR NOT NULL,
                field_name VARCHAR NOT NULL,
                old_value TEXT,
                new_value TEXT,
                editor_note TEXT,
                edited_at TIMESTAMP DEFAULT NOW()
            )""",
        ),
        (
            "user_companies",
            """CREATE TABLE IF NOT EXISTS user_companies (
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
            )""",
        ),
    ]
    for table_name, ddl in _DDL:
        try:
            with engine.begin() as conn:
                conn.execute(text(ddl))
            print(f"DB setup OK: {table_name}")
        except Exception as e:
            print(f"DB setup ERROR ({table_name}): {e}")

    # Additive column migrations — safe to re-run on every startup
    _MIGRATIONS = [
        "ALTER TABLE company_edits ADD COLUMN IF NOT EXISTS editor_note TEXT",
    ]
    for migration in _MIGRATIONS:
        try:
            with engine.begin() as conn:
                conn.execute(text(migration))
        except Exception as e:
            print(f"DB migration note: {e}")

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

COMPANY_SELECT = f"""
    SELECT company_id, company_name, doing_business_as, country, industry_codes,
           industry_codes_raw, status, TRUE,
           CASE WHEN COALESCE(TRIM(incorporation_date),'') ~ '^[0-9]{{4}}[-/][0-9]{{2}}[-/][0-9]{{2}}'
                THEN TRIM(incorporation_date)::date ELSE NULL END,
           NULL::date, city, state_province, country,
           CASE WHEN COALESCE(TRIM(director_min),'') ~ '^[0-9]+([.][0-9]+)?$'
                THEN TRIM(director_min)::numeric ELSE NULL END,
           CASE WHEN COALESCE(TRIM(director_max),'') ~ '^[0-9]+([.][0-9]+)?$'
                THEN TRIM(director_max)::numeric ELSE NULL END,
           entity_type, business_types,
           url, source, address_line1, postal_code, business_numbers, 'en', address_line2, NULL
    FROM {COMPANY_TABLE}
"""

# Columns aliased to standard names for UNION ALL with user_companies
# Casts needed: director_min/max are text in PG (parquet str dtype); user_companies has FLOAT.
# incorporation_date is text; user_companies.registration_date is DATE.
_MASTER_COMPANY_COLS = """
    company_id,
    company_name AS legal_name,
    doing_business_as AS dba_name,
    country,
    industry_codes AS industry_code,
    industry_codes_raw AS industry_description,
    status,
    TRUE::boolean AS is_active,
    CASE WHEN COALESCE(TRIM(incorporation_date),'') ~ '^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}'
         THEN TRIM(incorporation_date)::date ELSE NULL END AS registration_date,
    NULL::date AS dissolution_date,
    city AS address_city,
    state_province AS address_state,
    country AS address_country,
    CASE WHEN COALESCE(TRIM(director_min),'') ~ '^[0-9]+([.][0-9]+)?$'
         THEN TRIM(director_min)::numeric ELSE NULL END AS employees_min,
    CASE WHEN COALESCE(TRIM(director_max),'') ~ '^[0-9]+([.][0-9]+)?$'
         THEN TRIM(director_max)::numeric ELSE NULL END AS employees_max,
    entity_type AS entity_structure,
    business_types AS business_type,
    url AS company_url,
    source AS source_dataset,
    address_line1,
    postal_code AS address_postal_code,
    business_numbers AS business_number,
    'en'::text AS original_language,
    address_line2,
    NULL::text AS industry_system
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


def build_master_companies_where(q=None, country=None, industry=None, source_dataset=None):
    """WHERE clause builder for master_companies (new column names)."""
    conditions, params = [], {}
    if q:
        conditions.append("(company_name ILIKE :q OR doing_business_as ILIKE :q OR city ILIKE :q)")
        params["q"] = f"%{q}%"
    if country:
        conditions.append("country = :country")
        params["country"] = country
    if industry:
        conditions.append("industry_codes_raw ILIKE :industry")
        params["industry"] = f"%{industry}%"
    if source_dataset:
        conditions.append("source = :source_dataset")
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


# ─── Company endpoints ────────────────────────────────────────────────────────

@app.get("/api/import/template/companies")
async def import_template():
    """Download a CSV template for company import."""
    headers = [
        "legal_name", "country", "dba_name", "status", "industry_code",
        "industry_description", "address_line1", "address_city", "address_state",
        "address_postal_code", "entity_structure", "business_type",
        "registration_date", "employees_min", "employees_max", "company_url",
    ]
    example = [
        "Acme Ltd", "GBR", "", "Active", "62020",
        "Software Development", "1 High St", "London", "England",
        "EC1A 1BB", "Limited Company", "For Profit",
        "2015-06-01", "10", "50", "https://acme.example.com",
    ]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerow(example)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=l2b_companies_template.csv"},
    )


company_import_jobs: dict = {}

COMPANY_IMPORT_COLS = {
    "legal_name", "dba_name", "country", "industry_code", "industry_description",
    "status", "registration_date", "dissolution_date",
    "address_line1", "address_line2", "address_city", "address_state",
    "address_postal_code", "address_country", "business_number",
    "employees_min", "employees_max", "entity_structure", "business_type",
    "company_url", "industry_system",
}


def process_company_import(job_id: str, content: bytes):
    job = company_import_jobs[job_id]
    try:
        text_content = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text_content))
        fieldnames = set(reader.fieldnames or [])

        if "legal_name" not in fieldnames or "country" not in fieldnames:
            job["status"] = "failed"
            job["error"] = "CSV must include 'legal_name' and 'country' columns"
            return

        rows = list(reader)
        job["total"] = len(rows)

        db_gen = get_db()
        db: Session = next(db_gen)
        inserted, errors = 0, []

        try:
            for i, row in enumerate(rows):
                try:
                    legal_name = row.get("legal_name", "").strip()
                    country = row.get("country", "").strip()
                    if not legal_name or not country:
                        errors.append(f"Row {i+2}: legal_name and country are required")
                        continue

                    cid = str(uuid.uuid4()).replace("-", "")[:12].upper()
                    clean = {
                        "company_id": cid,
                        "legal_name": legal_name,
                        "country": country,
                        "is_active": True,
                        "source_dataset": "CSV_IMPORT",
                        "original_language": "en",
                        "industry_system": "OTHER",
                    }
                    for col in COMPANY_IMPORT_COLS - {"legal_name", "country"}:
                        v = row.get(col, "").strip()
                        if v:
                            if col in ("employees_min", "employees_max"):
                                try:
                                    clean[col] = float(v)
                                except ValueError:
                                    pass
                            elif col in ("registration_date", "dissolution_date"):
                                clean[col] = v or None
                            else:
                                clean[col] = v

                    cols_sql = ", ".join(clean.keys())
                    vals_sql = ", ".join(f":{k}" for k in clean.keys())
                    db.execute(text(f"INSERT INTO user_companies ({cols_sql}) VALUES ({vals_sql})"), clean)
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


@app.post("/api/companies/import")
async def import_companies(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    job_id = str(uuid.uuid4())
    company_import_jobs[job_id] = {
        "job_id": job_id,
        "filename": file.filename,
        "status": "processing",
        "processed": 0,
        "total": 0,
        "errors": [],
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
    }

    background_tasks.add_task(process_company_import, job_id, content)
    return {"job_id": job_id, "status": "processing", "message": "Import started"}


@app.get("/api/companies/import/status/{job_id}")
async def company_import_status(job_id: str):
    job = company_import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# =============================================================================
# COMPANY ENDPOINTS
# =============================================================================

USER_COMPANIES_TABLE = "user_companies"

# Column list for user_companies table (old schema — standard names, no aliases needed)
_USER_COMPANY_COLS = """company_id, legal_name, dba_name, country, industry_code,
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
        by_country = {}
        try:
            rows = db.execute(
                text(f"SELECT country, COUNT(*) AS cnt FROM {COMPANY_TABLE} GROUP BY country ORDER BY cnt DESC LIMIT 50")
            ).fetchall()
            by_country = {r[0]: int(r[1]) for r in rows if r[0]}
        except Exception:
            pass
        db.close()
        return {"total_companies": total, "by_country": by_country}
    except Exception as e:
        return {"total_companies": 0, "by_country": {}, "error": str(e)}


@app.get("/api/companies/stats/industry")
async def get_industry_stats():
    if not SessionLocal:
        return {"industries": []}
    try:
        db = SessionLocal()
        rows = db.execute(text(f"""
            SELECT industry_codes_raw, COUNT(*) AS cnt
            FROM {COMPANY_TABLE}
            WHERE industry_codes_raw IS NOT NULL AND TRIM(industry_codes_raw) != ''
            GROUP BY industry_codes_raw
            ORDER BY cnt DESC
            LIMIT 20
        """)).fetchall()
        db.close()
        return {"industries": [{"name": r[0], "count": int(r[1])} for r in rows]}
    except Exception as e:
        return {"industries": [], "error": str(e)}


@app.get("/api/companies/filters")
async def get_company_filters():
    if not SessionLocal:
        return {"countries": [], "source_datasets": []}
    try:
        db = SessionLocal()
        rows = db.execute(
            text(f"SELECT DISTINCT country FROM {COMPANY_TABLE} WHERE country IS NOT NULL ORDER BY country LIMIT 200")
        ).fetchall()
        db.close()
        return {"countries": [r[0] for r in rows], "source_datasets": []}
    except Exception:
        return {"countries": [], "source_datasets": []}


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
        master_where, params = build_master_companies_where(q, country, industry, source_dataset)
        user_where, _ = build_companies_where(q, country, industry, is_active, source_dataset)
        col = COMPANY_SORT_COLS.get(sort_by, "legal_name")
        order = "ASC" if sort_order.lower() != "desc" else "DESC"
        offset = (page - 1) * limit

        # Fetch one extra row to detect whether more pages exist — avoids COUNT(*) scan
        fetch_limit = limit + 1
        union_query = f"""
            SELECT {_MASTER_COMPANY_COLS} FROM {COMPANY_TABLE} {master_where}
            UNION ALL
            SELECT {_USER_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} {user_where}
            ORDER BY {col} {order} NULLS LAST
            LIMIT :limit OFFSET :offset
        """
        rows = db.execute(text(union_query), {**params, "limit": fetch_limit, "offset": offset}).fetchall()
        has_more = len(rows) == fetch_limit
        rows = rows[:limit]

        has_filters = bool(master_where)
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

        data = [row_to_company_dict(r) for r in rows]

        # Apply company_edits overlays so edited records show current values in list
        if data:
            all_ids = [d["company_id"] for d in data]
            try:
                ov_rows = db.execute(
                    text("""
                        SELECT DISTINCT ON (company_id, field_name)
                            company_id, field_name, new_value
                        FROM company_edits
                        WHERE company_id = ANY(:ids)
                        ORDER BY company_id, field_name, edited_at DESC
                    """),
                    {"ids": all_ids}
                ).fetchall()
                override_map: dict = {}
                for cid, field, val in ov_rows:
                    override_map.setdefault(cid, {})[field] = val
                for d in data:
                    for field, val in override_map.get(d["company_id"], {}).items():
                        if field in d:
                            d[field] = val
            except Exception as ov_err:
                print(f"WARN overlay in search: {ov_err}")

        return {
            "data": data,
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
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mc_company_name_trgm
                    ON {COMPANY_TABLE} USING gin(company_name gin_trgm_ops)
                """))
                conn.commit()
            with engine.connect() as conn:
                conn.execute(text(f"""
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mc_dba_trgm
                    ON {COMPANY_TABLE} USING gin(doing_business_as gin_trgm_ops)
                """))
                conn.commit()
            with engine.connect() as conn:
                conn.execute(text(f"""
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mc_city_trgm
                    ON {COMPANY_TABLE} USING gin(city gin_trgm_ops)
                """))
                conn.commit()
            with engine.connect() as conn:
                conn.execute(text(f"""
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mc_country
                    ON {COMPANY_TABLE}(country)
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
        master_where, params = build_master_companies_where(q, country, industry, source_dataset)
        user_where, _ = build_companies_where(q, country, industry, is_active, source_dataset)
        col = COMPANY_SORT_COLS.get(sort_by, "legal_name")
        order = "ASC" if sort_order.lower() != "desc" else "DESC"

        union_query = f"""
            SELECT {_MASTER_COMPANY_COLS} FROM {COMPANY_TABLE} {master_where}
            UNION ALL
            SELECT {_USER_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} {user_where}
            ORDER BY {col} {order} NULLS LAST LIMIT 10000
        """
        try:
            rows = db.execute(text(union_query), params).fetchall()
        except Exception as qe:
            raise HTTPException(status_code=500, detail=f"Query error: {type(qe).__name__}: {qe}")

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


def _safe_pdf(s, maxlen=None):
    if not isinstance(s, str):
        return ''
    out = s.encode('ascii', 'replace').decode('ascii').replace('?', ' ').strip()
    return out[:maxlen] if maxlen else out


@app.get("/api/companies/export/pdf")
async def export_companies_pdf(  # noqa: C901
    q: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    source_dataset: Optional[str] = Query(None),
    sort_by: str = Query("legal_name"),
    sort_order: str = Query("asc"),
):
    if not _FPDF_OK:
        raise HTTPException(status_code=501, detail="PDF export unavailable (fpdf2 not installed)")
    db_gen = get_db()
    db: Session = next(db_gen)
    try:
        master_where, params = build_master_companies_where(q, country, industry, source_dataset)
        user_where, _ = build_companies_where(q, country, industry, is_active, source_dataset)
        col = COMPANY_SORT_COLS.get(sort_by, "legal_name")
        order = "ASC" if sort_order.lower() != "desc" else "DESC"

        union_query = f"""
            SELECT {_MASTER_COMPANY_COLS} FROM {COMPANY_TABLE} {master_where}
            UNION ALL
            SELECT {_USER_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} {user_where}
            ORDER BY {col} {order} NULLS LAST LIMIT 500
        """
        try:
            rows = db.execute(text(union_query), params).fetchall()
        except Exception as qe:
            raise HTTPException(status_code=500, detail=f"Query error: {type(qe).__name__}: {qe}")

        try:
            pdf = FPDF(orientation="L", unit="mm", format="A4")
            pdf.set_margins(8, 8, 8)
            pdf.add_page()

            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, "L2B.click - Company Export",
                     new_x="LMARGIN", new_y="NEXT", align="C")
            pdf.set_font("Helvetica", "", 7)
            pdf.cell(0, 5,
                     f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC  |  {len(rows)} records",
                     new_x="LMARGIN", new_y="NEXT", align="C")
            pdf.ln(3)

            col_widths = [80, 18, 68, 32, 25, 50]
            col_headers = ["Company Name", "Country", "Industry", "City", "Status", "Website"]

            pdf.set_font("Helvetica", "B", 7)
            pdf.set_fill_color(40, 40, 65)
            pdf.set_text_color(240, 240, 255)
            for w, hdr in zip(col_widths, col_headers):
                pdf.cell(w, 6, hdr, border=0, fill=True)
            pdf.ln()

            pdf.set_text_color(20, 20, 30)
            for i, r in enumerate(rows):
                pdf.set_fill_color(245, 245, 250) if i % 2 == 0 else pdf.set_fill_color(255, 255, 255)
                pdf.set_font("Helvetica", "", 6.5)
                vals = [
                    _safe_pdf(r[1], 60),
                    _safe_pdf(r[3], 6),
                    _safe_pdf(r[5], 55),
                    _safe_pdf(r[10], 28),
                    _safe_pdf(r[6], 20),
                    _safe_pdf(r[17], 48),
                ]
                for w, v in zip(col_widths, vals):
                    pdf.cell(w, 5, v, border=0, fill=True)
                pdf.ln()

            pdf_bytes = bytes(pdf.output())
        except Exception as pe:
            raise HTTPException(status_code=500, detail=f"PDF generation error: {type(pe).__name__}: {pe}")

        filename = f"l2b_companies_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    finally:
        db.close()


@app.post("/api/companies/export/selected/csv")
async def export_selected_csv(body: dict = Body(...)):
    company_ids = body.get("company_ids", [])
    if not company_ids:
        raise HTTPException(status_code=400, detail="No company_ids provided")
    if len(company_ids) > 1000:
        raise HTTPException(status_code=400, detail="Max 1000 records per export")

    db_gen = get_db()
    db: Session = next(db_gen)
    try:
        rows = db.execute(
            text(f"""
                SELECT {_MASTER_COMPANY_COLS} FROM {COMPANY_TABLE}
                WHERE company_id = ANY(:ids)
                UNION ALL
                SELECT {_USER_COMPANY_COLS} FROM {USER_COMPANIES_TABLE}
                WHERE company_id = ANY(:ids)
            """),
            {"ids": company_ids}
        ).fetchall()

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

        filename = f"l2b_selected_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.csv"
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
    except Exception as e:
        print(f"ERROR /api/companies/{company_id}/history: {type(e).__name__}: {e}")
        return {"company_id": company_id, "edits": [], "db_error": str(e)}
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
            text(f"SELECT {_USER_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} WHERE company_id = :cid"),
            {"cid": company_id}
        ).fetchone()
        if row:
            d = row_to_company_dict(row)
            d["_overridden_fields"] = []
            d["_is_user_record"] = True
            return d

        # Fall back to master table + apply edits overlay
        row = db.execute(
            text(f"{COMPANY_SELECT} WHERE company_id = :cid"),
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
            # Snapshot old values before update so history shows diffs
            old_row = db.execute(
                text(f"SELECT {_USER_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} WHERE company_id = :cid"),
                {"cid": company_id}
            ).fetchone()
            old_dict = row_to_company_dict(old_row) if old_row else {}

            set_clause = ", ".join(f"{f} = :{f}" for f in updates.keys())
            db.execute(
                text(f"UPDATE {USER_COMPANIES_TABLE} SET {set_clause} WHERE company_id = :cid"),
                {**updates, "cid": company_id}
            )
            for field, new_val in updates.items():
                old_val = old_dict.get(field)
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
            row = db.execute(
                text(f"SELECT {_USER_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} WHERE company_id = :cid"),
                {"cid": company_id}
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Company not found")
            d = row_to_company_dict(row)
            d["_overridden_fields"] = []
            d["_is_user_record"] = True
            return d

        # Master record: fetch current state (with any existing overlays) for old_value capture
        master_row = db.execute(
            text(f"{COMPANY_SELECT} WHERE company_id = :cid"),
            {"cid": company_id}
        ).fetchone()
        if not master_row:
            raise HTTPException(status_code=404, detail="Company not found")

        current_dict = row_to_company_dict(master_row)
        _apply_edits_overlay(current_dict, db)  # get effective current values

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
        d = row_to_company_dict(master_row)
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
            text(f"SELECT {_USER_COMPANY_COLS} FROM {USER_COMPANIES_TABLE} WHERE company_id = :cid"),
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
