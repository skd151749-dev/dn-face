# DN FACE / FaceMark

AI-powered face recognition attendance and meal monitoring system for school demos and competitions.

## Stack

- Frontend: React + Vite
- Backend: FastAPI
- Database: SQLite
- Face recognition: OpenCV + face_recognition + dlib
- Auth: JWT
- Reports: Excel, CSV, PDF

## Core features

- JWT login with admin and student roles
- Group selection before dashboard access
- Dynamic group management
- Face registration and live attendance scanning
- Morning and afternoon attendance windows
- Configurable late thresholds for both sessions
- Early checkout request and approval flow
- Meal verification after attendance
- Notifications
- Branding with uploaded logo
- Daily, weekly, monthly reporting
- Export to Excel, CSV, PDF

## Default login

- Admin username: `admin001`
- Admin password: `admin123`

## Time control model

Admin can configure six time points:

- `morning_check_in`
- `morning_late_after`
- `morning_check_out`
- `afternoon_check_in`
- `afternoon_late_after`
- `afternoon_check_out`

Attendance behavior:

- Before `morning_check_in`: scan is rejected as too early
- `morning_check_in` to `morning_late_after`: morning check-in is `On Time`
- At or after `morning_late_after`: morning check-in is `Late`
- At or after `morning_check_out`: morning checkout becomes valid
- `afternoon_check_in` to `afternoon_late_after`: afternoon check-in is `On Time`
- At or after `afternoon_late_after`: afternoon check-in is `Late`
- Before `afternoon_check_out`: afternoon checkout requires approved early-leave request
- At or after `afternoon_check_out`: normal afternoon checkout is allowed

## Local run

### Backend

```bat
cd /d D:\DNV2\dn-face-project
start_backend.cmd
```

Manual backend run:

```bat
cd /d D:\DNV2\dn-face-project
D:\DNV2\dn-face-project\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bat
cd /d D:\DNV2\dn-face-project
start_frontend.cmd
```

Manual frontend run:

```bat
cd /d D:\DNV2\dn-face-project\frontend
npm run dev
```

### URLs

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8000](http://localhost:8000)
- API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## Sample data

```bat
cd /d D:\DNV2\dn-face-project
seed_sample_data.cmd
```

## Important files

- Backend entry: `D:\DNV2\dn-face-project\backend\main.py`
- Backend DB layer: `D:\DNV2\dn-face-project\backend\database.py`
- Frontend settings page: `D:\DNV2\dn-face-project\frontend\src\pages\Settings.jsx`
- Frontend scan page: `D:\DNV2\dn-face-project\frontend\src\pages\ScanAttendance.jsx`
- Frontend reports page: `D:\DNV2\dn-face-project\frontend\src\pages\Reports.jsx`
- Report exporter: `D:\DNV2\dn-face-project\reports\excel_export.py`
- Root Vercel backend entry: `D:\DNV2\dn-face-project\app.py`

## Git upload

Initialize Git and push to GitHub:

```bat
cd /d D:\DNV2\dn-face-project
git init
git add .
git commit -m "Initial DN FACE release"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPO.git
git push -u origin main
```

## Vercel deployment

This repository is prepared for two-project deployment:

### 1. Backend project on Vercel

Deploy the repository root.

Files used:

- `app.py`
- `requirements.txt` (Vercel-safe backend dependencies)
- `vercel.json`

Recommended environment variables:

- `DNFACE_ALLOWED_ORIGINS=https://your-frontend.vercel.app`
- `DNFACE_ALLOWED_ORIGIN_REGEX=https://.*\.vercel\.app`
- Optional: `DNFACE_DB_PATH=/tmp/dnface.db`
- Optional: `DNFACE_MEDIA_ROOT=/tmp/dnface-media`

### 2. Frontend project on Vercel

Deploy the `frontend` directory as a separate Vercel project.

Required environment variable:

- `VITE_API_BASE=https://your-backend-project.vercel.app`

Files used:

- `frontend/vercel.json`
- `frontend/.env.production.example`

## Important Vercel limitation

This project still uses SQLite and local file uploads. On Vercel Functions, the filesystem is not persistent. That means:

- runtime writes should use `/tmp`
- database changes on Vercel are temporary
- uploaded logos on Vercel are temporary

For a real persistent hosted version, move to:

- a hosted database such as PostgreSQL, MySQL, or Vercel Postgres
- persistent file storage such as Vercel Blob, S3, or Cloudinary

For a school demo, the current Vercel setup is sufficient for preview and click-through testing. The Vercel backend uses the lighter root `requirements.txt`, so the hosted build runs in API/demo mode instead of full local `dlib` recognition. Persistent production data still requires external storage.
