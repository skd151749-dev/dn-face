import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.main import MEDIA_ROOT, app as api_app

PROJECT_ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = PROJECT_ROOT / "public"
MEDIA_DIR = Path(MEDIA_ROOT)


def ensure_demo_seed():
    if not os.getenv("VERCEL"):
        return

    from backend.database import Database
    from backend.seed_sample_data import main as seed_sample_data

    db = Database()
    if len(db.get_all_users()) <= 1:
        seed_sample_data()


ensure_demo_seed()

app = FastAPI(title="DN FACE Web App")
app.mount("/api", api_app)

if MEDIA_DIR.exists():
    app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/{full_path:path}")
def serve_frontend(full_path: str = ""):
    if PUBLIC_DIR.exists():
        requested = (PUBLIC_DIR / full_path).resolve()
        if full_path and str(requested).startswith(str(PUBLIC_DIR.resolve())) and requested.is_file():
            return FileResponse(requested)

        index_file = PUBLIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)

    return JSONResponse(
        {
            "status": "DN FACE backend running",
            "message": "Frontend build not found. Run the root build step to generate the public site.",
        }
    )
