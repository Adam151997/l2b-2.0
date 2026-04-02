# L2B.click - Business Intelligence Platform

Monorepo containing:
- `/backend` - FastAPI backend with PostgreSQL
- `/frontend` - Static HTML/JS/CSS frontend

## Development

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend (dev)
```bash
cd frontend
# Serve with any static server, e.g.:
python -m http.server 8000
```

## Deployment (Railway)
Single deployment serves both API and frontend from the same container.

## Structure
```
/
├── backend/          # Python FastAPI application
│   ├── main.py      # API endpoints & business logic
│   ├── requirements.txt
│   └── ...
├── frontend/        # Static frontend files
│   ├── index.html
│   ├── script.js
│   └── styles.css
└── README.md
```