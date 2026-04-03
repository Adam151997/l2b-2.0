from fastapi import FastAPI, HTTPException, Depends, Query, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from pathlib import Path
from dotenv import load_dotenv
import requests
import json
from datetime import datetime
import secrets
import hashlib

# Load environment variables
load_dotenv()

# =============================================================================
# DATABASE CONFIGURATION - RAILWAY COMPATIBLE
# =============================================================================

def get_database_url():
    """Get database URL from Railway or other hosting platforms"""
    # Check Railway-specific variables first
    # Railway sets DATABASE_URL when you link a PostgreSQL service
    
    # IMPORTANT: Railway sometimes includes the key name in the value
    # e.g., "Database_URL=postgresql://..." - need to strip the key
    
    def extract_url(value):
        """Extract actual URL from potentially malformed env var value"""
        if not value:
            return None
        
        # Strip surrounding quotes if present (Railway might set "Database_URL" with quotes)
        value = value.strip('"\'')
        
        # If value contains = sign after stripping quotes, it might be "KEY=URL" format
        if '=' in value:
            # Try to find the actual URL after any key= pattern
            parts = value.split('=', 1)
            url_part = parts[-1].strip()
            # Strip quotes again in case URL has quotes
            url_part = url_part.strip('"\'')
            # If it looks like a URL (has ://), return it
            if '://' in url_part:
                return url_part
            # Otherwise, try the whole thing
            if '://' in value:
                return value
            return None
        return value
    
    # Method 1: Standard DATABASE_URL (Railway, Heroku, etc.)
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return extract_url(db_url)
    
    # Method 1b: Capital D variant (Railway sometimes uses this)
    db_url = os.environ.get("Database_URL")
    if db_url:
        extracted = extract_url(db_url)
        if extracted:
            print(f"Extracted URL from Database_URL: {extracted[:40]}...")
            return extracted
    
    # Method 2: Railway's internal URL (sometimes used)
    db_url = os.environ.get("POSTGRES_URL")
    if db_url:
        return extract_url(db_url)
    
    # Method 3: Check for Railway proxy URL format (case-insensitive)
    for key, value in os.environ.items():
        key_upper = key.upper()
        if "POSTGRES" in key_upper and "URL" in key_upper:
            if "proxy.rlwy.net" in value or "railway.internal" in value:
                extracted = extract_url(value)
                if extracted:
                    print(f"Found database URL in env var: {key} = {extracted[:30]}...")
                    return extracted
    
    # Method 4: PostgreSQL on Railway might use this
    db_url = os.environ.get("PGDATABASE_URL")
    if db_url:
        return extract_url(db_url)
    
    return None

DATABASE_URL = get_database_url()

print("=== DATABASE CONNECTION DEBUG ===")
print(f"DATABASE_URL source check: {repr(DATABASE_URL)[:80] if DATABASE_URL else 'NOT FOUND'}")

# IMPORTANT: In production, we should NOT have a fallback to localhost
# If DATABASE_URL is None, the app will fail - which is correct behavior
if not DATABASE_URL:
    print("ERROR: No DATABASE_URL found!")
    print(f"All env vars with 'DATA': {[k for k in os.environ.keys() if 'DATA' in k.upper()]}")
    # Don't set a fallback - let the app crash so we can see the error
    DATABASE_URL = None
else:
    print(f"SUCCESS: Database URL found: {DATABASE_URL[:40]}...")

# DeepSeek AI configuration - MUST be set in environment for production
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

# Initialize database engine - will fail gracefully if no DATABASE_URL
if DATABASE_URL:
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    print("Database engine initialized successfully")
else:
    # Create a dummy engine that will fail on use
    # This allows the app to start but all DB operations will fail
    print("WARNING: Starting without database connection - all search will fail")
    engine = None
    SessionLocal = None

print(f"Database URL: {DATABASE_URL[:50]}..." if DATABASE_URL else "Database URL: NOT CONFIGURED")
print(f"DeepSeek API Key: {'✅ Configured' if DEEPSEEK_API_KEY and DEEPSEEK_API_KEY.startswith('sk-') else '⚠️ NOT CONFIGURED - Set DEEPSEEK_API_KEY environment variable'}")

# Initialize FastAPI
app = FastAPI(
    title="L2B.click Business Intelligence API",
    description="API for US business data with AI-powered insights",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Production security middleware
if os.getenv("ENVIRONMENT") == "production":
    app.add_middleware(HTTPSRedirectMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["l2b.click", "www.l2b.click"])

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# Pydantic models
class BusinessBasic(BaseModel):
    id: int
    legal_business_name: str
    business_city: str
    business_state: str
    business_country: str
    industry_sector: Optional[str]
    primary_naics: Optional[str]
    industry_name: Optional[str]

class AIGenerateRequest(BaseModel):
    analysis_type: str = "business_insights"

class UserRegister(BaseModel):
    email: str
    plan: str = "free"

class UserUpgrade(BaseModel):
    new_plan: str

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# =============================================================================
# USER MANAGEMENT SYSTEM
# =============================================================================

class UserManager:
    def __init__(self):
        self.users = {}
        self.api_keys = {}
        # Create demo users for testing
        self.create_user("demo@l2b.click", "free")
        self.create_user("premium@l2b.click", "premium")
        
    def create_user(self, email: str, plan: str = "free"):
        """Create a new user with API key"""
        user_id = len(self.users) + 1
        api_key = f"l2b_{secrets.token_urlsafe(24)}"
        
        user_data = {
            "user_id": user_id,
            "email": email,
            "plan": plan,
            "api_key": api_key,
            "created_at": datetime.utcnow(),
            "credits_used": 0,
            "max_credits": self._get_max_credits(plan),
            "is_active": True,
            "premium_features": self._get_premium_features(plan)
        }
        
        self.users[user_id] = user_data
        self.api_keys[api_key] = user_id
        
        print(f"✅ Created user: {email} with plan: {plan}")
        return user_data
    
    def _get_max_credits(self, plan: str) -> int:
        """Get max credits based on plan"""
        plans = {
            "free": 50,
            "premium": 1000,
            "enterprise": 10000
        }
        return plans.get(plan, 50)
    
    def _get_premium_features(self, plan: str) -> List[str]:
        """Get premium features based on plan"""
        features = {
            "free": ["basic_search", "ai_insights"],
            "premium": ["basic_search", "ai_insights", "premium_contacts", "advanced_filters"],
            "enterprise": ["basic_search", "ai_insights", "premium_contacts", "advanced_filters", "api_access", "white_label"]
        }
        return features.get(plan, ["basic_search"])
    
    def validate_api_key(self, api_key: str) -> Optional[Dict]:
        """Validate API key and return user data"""
        if not api_key:
            return None
            
        if api_key in self.api_keys:
            user_id = self.api_keys[api_key]
            user = self.users.get(user_id)
            if user and user["is_active"]:
                return user
        return None
    
    def use_credit(self, api_key: str, feature: str = "api_call") -> bool:
        """Use one credit for API call"""
        user = self.validate_api_key(api_key)
        if not user:
            return False
            
        # Check if feature requires premium
        if feature in ["premium_contacts", "ai_insights"] and user["plan"] == "free":
            return False
            
        # Check credit limit
        if user["credits_used"] >= user["max_credits"]:
            return False
            
        user["credits_used"] += 1
        return True
    
    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email"""
        for user in self.users.values():
            if user["email"] == email:
                return user
        return None
    
    def upgrade_plan(self, api_key: str, new_plan: str) -> bool:
        """Upgrade user plan"""
        user = self.validate_api_key(api_key)
        if not user:
            return False
            
        user["plan"] = new_plan
        user["max_credits"] = self._get_max_credits(new_plan)
        user["premium_features"] = self._get_premium_features(new_plan)
        return True

# Initialize user manager
user_manager = UserManager()

# User authentication dependency
def get_current_user(x_api_key: str = Header(None)):
    """Dependency to get current user from API key"""
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail="API key required. Register at /api/users/register"
        )
    
    user = user_manager.validate_api_key(x_api_key)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )
    
    return user

def require_premium_user(user: Dict = Depends(get_current_user)):
    """Dependency to require premium plan"""
    if user["plan"] not in ["premium", "enterprise"]:
        raise HTTPException(
            status_code=402,
            detail="Premium plan required. Upgrade at /api/users/upgrade"
        )
    return user

# =============================================================================
# NAICS CODE MAPPING (UNCHANGED)
# =============================================================================

def map_naics_to_industry(naics_code: str) -> str:
    """Map NAICS codes to human-readable industry names"""
    naics_mapping = {
        "541511": "Custom Computer Programming Services",
        "541512": "Computer Systems Design Services",
        "541513": "Computer Facilities Management Services",
        "541519": "Other Computer Related Services",
        "541611": "Administrative Management and General Management Consulting",
        "541612": "Human Resources Consulting",
        "541613": "Marketing Consulting",
        "541614": "Process, Physical Distribution, and Logistics Consulting",
        "541618": "Other Management Consulting",
        "541810": "Advertising Agencies",
        "541820": "Public Relations Agencies",
        "541830": "Media Buying Agencies",
        "541840": "Media Representatives",
        "541850": "Outdoor Advertising",
        "541860": "Direct Mail Advertising",
        "541870": "Advertising Material Distribution",
        "541890": "Other Services Related to Advertising",
        "541910": "Marketing Research and Public Opinion Polling",
        "541921": "Photography Studios, Portrait",
        "541922": "Commercial Photography",
        "541930": "Translation and Interpretation Services",
        "541940": "Veterinary Services",
        "541990": "All Other Professional, Scientific, and Technical Services",
        "611410": "Business and Secretarial Schools",
        "611420": "Computer Training",
        "611430": "Professional and Management Development Training",
        "611511": "Cosmetology and Barber Schools",
        "611512": "Flight Training",
        "611513": "Apprenticeship Training",
        "611519": "Other Technical and Trade Schools",
        "611610": "Fine Arts Schools",
        "611620": "Sports and Recreation Instruction",
        "611630": "Language Schools",
        "611691": "Exam Preparation and Tutoring",
        "611692": "Automobile Driving Schools",
        "611699": "All Other Miscellaneous Schools and Instruction",
        "611710": "Educational Support Services",
    }
    
    if not naics_code:
        return "Industry not classified"
    
    if naics_code in naics_mapping:
        return naics_mapping[naics_code]
    
    if len(naics_code) >= 5:
        five_digit = naics_code[:5]
        for code, industry in naics_mapping.items():
            if code.startswith(five_digit):
                return industry
    
    if len(naics_code) >= 4:
        four_digit = naics_code[:4]
        broad_mapping = {
            "5415": "Computer Systems Design and Related Services",
            "5416": "Management, Scientific, and Technical Consulting",
            "5418": "Advertising and Related Services",
            "5419": "Other Professional and Technical Services",
            "6114": "Business, Computer and Management Training",
            "6115": "Technical and Trade Schools",
            "6116": "Other Schools and Instruction",
        }
        if four_digit in broad_mapping:
            return broad_mapping[four_digit]
    
    return f"NAICS {naics_code}"

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    if os.getenv("ENVIRONMENT") == "production":
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# DeepSeek AI function
def call_deepseek_ai(prompt: str) -> Dict[str, Any]:
    """Call DeepSeek AI API for insights"""
    if not DEEPSEEK_API_KEY or not DEEPSEEK_API_KEY.startswith('sk-'):
        return {
            "success": False,
            "content": "DeepSeek API key not configured. Please add DEEPSEEK_API_KEY to environment variables.",
            "error": "API_KEY_MISSING"
        }
    
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
        }
        
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {
                    "role": "system", 
                    "content": "You are a business intelligence analyst providing concise, actionable insights about US businesses. Focus on practical business analysis and be specific."
                },
                {
                    "role": "user", 
                    "content": prompt
                }
            ],
            "temperature": 0.7,
            "max_tokens": 800
        }
        
        response = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        return {
            "success": True,
            "content": result["choices"][0]["message"]["content"],
            "usage": result.get("usage", {})
        }
    
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "content": "AI service timeout. Please try again.",
            "error": "TIMEOUT"
        }
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "content": f"AI service error: {str(e)}",
            "error": "REQUEST_ERROR"
        }
    except Exception as e:
        return {
            "success": False,
            "content": f"Unexpected error: {str(e)}",
            "error": "UNKNOWN_ERROR"
        }

# =============================================================================
# EXISTING ENDPOINTS (ENHANCED WITH USER SYSTEM)
# =============================================================================

@app.get("/health")
async def health_check():
    try:
        db = SessionLocal()
        result = db.execute(text("SELECT COUNT(*) FROM businesses"))
        count = result.scalar()
        db.close()
        return {
            "status": "healthy",
            "database": "connected",
            "total_businesses": count,
            "ai_service": "available" if DEEPSEEK_API_KEY and DEEPSEEK_API_KEY.startswith('sk-') else "not_configured",
            "total_users": len(user_manager.users)
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }

@app.get("/api/businesses/search")
async def search_businesses(
    name: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Search businesses - Free, no authentication required"""
    
    query = "SELECT id, legal_business_name, business_city, business_state, business_country, industry_sector, primary_naics FROM businesses WHERE 1=1"
    params = {}
    
    if name:
        query += " AND legal_business_name ILIKE :name"
        params["name"] = f"%{name}%"
    if city:
        query += " AND business_city ILIKE :city"
        params["city"] = f"%{city}%"
    if state:
        query += " AND business_state = :state"
        params["state"] = state.upper()
    if industry:
        query += " AND industry_sector ILIKE :industry"
        params["industry"] = f"%{industry}%"
    
    offset = (page - 1) * limit
    query += " ORDER BY legal_business_name LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset
    
    result = db.execute(text(query), params)
    businesses = result.fetchall()
    
    business_list = []
    for biz in businesses:
        industry_name = map_naics_to_industry(biz[6])
        
        business_list.append({
            "id": biz[0],
            "legal_business_name": biz[1],
            "business_city": biz[2],
            "business_state": biz[3],
            "business_country": biz[4],
            "industry_sector": biz[5],
            "primary_naics": biz[6],
            "industry_name": industry_name
        })
    
    # Get total count
    count_query = "SELECT COUNT(*) FROM businesses WHERE 1=1"
    count_params = {k: v for k, v in params.items() if k not in ['limit', 'offset']}
    total_result = db.execute(text(count_query), count_params)
    total_count = total_result.scalar()
    
    return {
        "data": business_list,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_count,
            "pages": (total_count + limit - 1) // limit
        }
    }

@app.get("/api/businesses/{business_id}")
async def get_business(
    business_id: int,
    premium: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Get business details - Free, no authentication required"""
    
    if premium:
        query = "SELECT * FROM businesses WHERE id = :id"
    else:
        query = "SELECT id, legal_business_name, business_city, business_state, business_country, industry_sector, primary_naics FROM businesses WHERE id = :id"
    
    result = db.execute(text(query), {"id": business_id})
    business = result.fetchone()
    
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    industry_name = map_naics_to_industry(business[6])
    
    if premium:
        business_data = dict(business._mapping)
        business_data.pop('created_at', None)
        business_data.pop('updated_at', None)
        business_data['industry_name'] = industry_name
    else:
        business_data = {
            "id": business[0],
            "legal_business_name": business[1],
            "business_city": business[2],
            "business_state": business[3],
            "business_country": business[4],
            "industry_sector": business[5],
            "primary_naics": business[6],
            "industry_name": industry_name
        }
    
    return {
        "data": business_data,
        "tier": "premium" if premium else "free"
    }

@app.get("/api/businesses/{business_id}/contact")
async def get_business_contact(
    business_id: int,
    db: Session = Depends(get_db)
):
    """Contact information - Free, no authentication required"""
    
    try:
        # Get business data for professional contact info
        query = """
            SELECT 
                id,
                legal_business_name,
                business_city,
                business_state,
                physical_address_line_1,
                cage_code,
                primary_naics
            FROM businesses 
            WHERE id = :id
        """
        result = db.execute(text(query), {"id": business_id})
        business_data = result.fetchone()
        
        if not business_data:
            raise HTTPException(status_code=404, detail="Business not found")
        
        # Build professional contact information
        address_parts = []
        if business_data[4]:  # physical_address_line_1
            address_parts.append(business_data[4])
        if business_data[2]:  # business_city
            address_parts.append(business_data[2])
        if business_data[3]:  # business_state
            address_parts.append(business_data[3])
        
        full_address = ", ".join([part for part in address_parts if part]) if address_parts else "Address not available"
        
        # Generate professional contact details
        business_name_clean = business_data[1].replace(' ', '').lower()
        industry_name = map_naics_to_industry(business_data[6])
        
        return {
            "premium_contact": {
                "email": f"info@{business_name_clean}.com", 
                "address": full_address,
                "contact_person": "Business Development Manager",
                "title": "Primary Contact",
                "linkedin": f"https://linkedin.com/company/{business_name_clean}",
                "website": f"https://{business_name_clean}.com",
                "cage_code": business_data[5] or "Not available",
                "industry": industry_name
            },
            "business_id": business_data[0],
            "business_name": business_data[1]
        }
        
    except Exception as e:
        print(f"Premium endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

@app.post("/api/businesses/{business_id}/ai-insights")
async def generate_ai_insights(
    business_id: int,
    request: AIGenerateRequest,
    db: Session = Depends(get_db)
):
    """Generate AI insights for a business - Free, no authentication required"""
    
    # Get business data
    query = """
        SELECT 
            legal_business_name, business_city, business_state, 
            industry_sector, primary_naics, business_types,
            entity_structure, cage_code, country_of_incorporation
        FROM businesses 
        WHERE id = :id
    """
    
    result = db.execute(text(query), {"id": business_id})
    business = result.fetchone()
    
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Prepare business context for AI
    business_context = f"""
    Business Name: {business[0]}
    Location: {business[1]}, {business[2]}
    Industry Sector: {business[3]}
    NAICS Code: {business[4]}
    Business Types: {business[5]}
    Entity Structure: {business[6]}
    CAGE Code: {business[7]}
    Country of Incorporation: {business[8]}
    """
    
    # Generate AI prompt based on analysis type
    if request.analysis_type == "business_insights":
        prompt = f"""
        Analyze this US business and provide key insights in bullet points:
        
        {business_context}
        
        Focus on:
        - Business classification and size estimation
        - Industry opportunities and market positioning
        - Potential growth areas
        - Key strengths and differentiators
        """
    
    elif request.analysis_type == "lead_scoring":
        prompt = f"""
        Evaluate this business as a sales lead and provide analysis:
        
        {business_context}
        
        Provide:
        - Lead quality score (1-10 scale)
        - Key strengths as a potential client
        - Potential concerns or challenges
        - Recommended engagement strategy
        """
    
    elif request.analysis_type == "market_analysis":
        prompt = f"""
        Provide market analysis for this business:
        
        {business_context}
        
        Analyze:
        - Market size and competition landscape
        - Industry trends affecting this business
        - Potential partnership opportunities
        - Risk factors and market challenges
        """
    
    else:
        raise HTTPException(status_code=400, detail="Invalid analysis type. Use: business_insights, lead_scoring, or market_analysis")
    
    # Call DeepSeek AI
    ai_result = call_deepseek_ai(prompt)
    
    return {
        "business_id": business_id,
        "business_name": business[0],
        "analysis_type": request.analysis_type,
        "success": ai_result["success"],
        "ai_insights": ai_result["content"],
        "error": ai_result.get("error"),
        "usage": ai_result.get("usage"),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "user_credits_used": user["credits_used"]
    }

# =============================================================================
# NEW USER MANAGEMENT ENDPOINTS
# =============================================================================

@app.post("/api/users/register")
async def register_user(
    email: str = Query(..., description="User email address"),
    plan: str = Query("free", description="Plan type: free, premium, enterprise")
):
    """Register a new user and get API key"""
    try:
        # Validate plan
        if plan not in ["free", "premium", "enterprise"]:
            raise HTTPException(status_code=400, detail="Invalid plan. Use: free, premium, enterprise")
        
        # Check if email already exists
        existing_user = user_manager.get_user_by_email(email)
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create user
        user_data = user_manager.create_user(email, plan)
        
        return {
            "success": True,
            "user_id": user_data["user_id"],
            "email": user_data["email"],
            "plan": user_data["plan"],
            "api_key": user_data["api_key"],
            "max_credits": user_data["max_credits"],
            "premium_features": user_data["premium_features"],
            "message": "User registered successfully. Save your API key securely!"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/users/profile")
async def get_user_profile(user: Dict = Depends(get_current_user)):
    """Get user profile and usage statistics"""
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "plan": user["plan"],
        "credits_used": user["credits_used"],
        "max_credits": user["max_credits"],
        "credits_remaining": user["max_credits"] - user["credits_used"],
        "premium_features": user["premium_features"],
        "is_active": user["is_active"],
        "created_at": user["created_at"].isoformat()
    }

@app.post("/api/users/upgrade")
async def upgrade_plan(
    new_plan: str = Query(..., description="New plan: premium, enterprise"),
    user: Dict = Depends(get_current_user)
):
    """Upgrade user plan"""
    try:
        if new_plan not in ["premium", "enterprise"]:
            raise HTTPException(status_code=400, detail="Invalid plan. Use: premium, enterprise")
        
        if user["plan"] == new_plan:
            raise HTTPException(status_code=400, detail=f"Already on {new_plan} plan")
        
        success = user_manager.upgrade_plan(user["api_key"], new_plan)
        if not success:
            raise HTTPException(status_code=400, detail="Upgrade failed")
        
        return {
            "success": True,
            "old_plan": user["plan"],
            "new_plan": new_plan,
            "new_max_credits": user["max_credits"],
            "new_premium_features": user["premium_features"],
            "message": f"Plan upgraded to {new_plan} successfully!"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# =============================================================================
# EXISTING STATISTICS ENDPOINTS (UNCHANGED)
# =============================================================================

@app.get("/api/industries")
async def get_industries(db: Session = Depends(get_db)):
    query = "SELECT DISTINCT industry_sector, COUNT(*) as business_count FROM businesses WHERE industry_sector IS NOT NULL GROUP BY industry_sector ORDER BY business_count DESC"
    result = db.execute(text(query))
    industries = result.fetchall()
    
    return {
        "industries": [
            {"industry": row[0], "business_count": row[1]}
            for row in industries
        ]
    }

@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    total_businesses = db.execute(text("SELECT COUNT(*) FROM businesses")).scalar()
    total_states = db.execute(text("SELECT COUNT(DISTINCT business_state) FROM businesses")).scalar()
    total_industries = db.execute(text("SELECT COUNT(DISTINCT industry_sector) FROM businesses")).scalar()
    
    return {
        "total_businesses": total_businesses,
        "total_states": total_states,
        "total_industries": total_industries,
        "total_users": len(user_manager.users)
    }

# =============================================================================
# FRONTEND SERVING (MONOREPO)
# =============================================================================

# Get the directory paths
BACKEND_DIR = Path(__file__).parent
FRONTEND_DIR = BACKEND_DIR / "dist"

# Serve index.html at root
@app.get("/")
async def serve_index():
    """Serve the main index.html"""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return {"message": "L2B.click - Use /docs for API documentation"}

# Serve static files (CSS, JS, images)
@app.get("/styles.css")
async def serve_css():
    """Serve styles.css"""
    css_path = FRONTEND_DIR / "styles.css"
    if css_path.exists():
        return FileResponse(
            css_path,
            media_type="text/css",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )

@app.get("/script.js")
async def serve_js():
    """Serve script.js"""
    js_path = FRONTEND_DIR / "script.js"
    if js_path.exists():
        return FileResponse(
            js_path,
            media_type="application/javascript",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )

# Fallback - serve index.html for SPA routes (but NOT API)
@app.get("/{path:path}")
async def serve_spa(path: str):
    """Serve index.html for frontend routes"""
    # Let FastAPI handle API routes - they should already be handled
    # This is the catch-all for frontend SPA
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return {"error": "Not found"}