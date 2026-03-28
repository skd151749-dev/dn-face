# DN FACE / FaceMark

AI-powered face recognition attendance and meal monitoring system for school demos and competitions.

## Stack

- Frontend: React + Vite
- Backend: FastAPI
- Database: SQLite
- Face recognition: OpenCV + face_recognition + dlib locally, demo-safe fallback on Vercel
- Auth: JWT
- Reports: Excel, CSV, PDF

## Local run

### Backend

```bat
cd /d D:\DNV2\dn-face-project
start_backend.cmd
```

### Frontend

```bat
cd /d D:\DNV2\dn-face-project
start_frontend.cmd
```

### Local URLs

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://localhost:8000](http://localhost:8000)
- API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## Default login

- Admin username: `admin001`
- Admin password: `admin123`

## Attendance schedule model

Admin can configure:

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

## One-project Vercel deployment

This repository is prepared for direct deployment as a single Vercel project.

How it works:

- `npm run build` builds the React frontend
- `scripts/prepare-vercel.mjs` copies the built frontend into `public/`
- `app.py` serves:
  - the API at `/api/*`
  - the frontend SPA at `/`
  - logo/media files at `/media/*`
- the frontend automatically calls `/api` in production, so no environment variable is required

## GitHub + Vercel quick steps

### Push to GitHub

```bat
cd /d D:\DNV2\dn-face-project
git add .
git commit -m "Update DN FACE for one-click Vercel deploy"
git push
```

### Deploy on Vercel

1. Import the GitHub repository into Vercel
2. Keep the root directory as the repository root
3. Click `Deploy`

That is all. No extra environment variables are required for the default demo deployment.

## Vercel demo behavior

On Vercel, the app automatically:

- uses same-origin API calls through `/api`
- seeds demo users if the hosted database starts empty
- falls back to demo-safe face mode if heavy native face packages are unavailable

This makes the hosted version easier to click through in a competition setting.

## Important Vercel limitation

Vercel Functions do not provide durable local file storage for writes. This project therefore works best on Vercel as a hosted demo version.

Practical impact:

- the hosted frontend works well
- the hosted API works well for demo use
- database writes and uploaded logos are not durable long-term
- full persistent production data still needs external storage

For a real persistent deployment later, move the database and uploaded files to managed storage.

## Sample data

```bat
cd /d D:\DNV2\dn-face-project
seed_sample_data.cmd
```

## Important files

- One-project Vercel entry: `D:\DNV2\dn-face-project\app.py`
- Backend API: `D:\DNV2\dn-face-project\backend\main.py`
- Backend DB layer: `D:\DNV2\dn-face-project\backend\database.py`
- Demo seeding: `D:\DNV2\dn-face-project\backend\seed_sample_data.py`
- Root build script: `D:\DNV2\dn-face-project\package.json`
- Public build copier: `D:\DNV2\dn-face-project\scripts\prepare-vercel.mjs`
- Frontend settings page: `D:\DNV2\dn-face-project\frontend\src\pages\Settings.jsx`
- Frontend scan page: `D:\DNV2\dn-face-project\frontend\src\pages\ScanAttendance.jsx`
- Frontend reports page: `D:\DNV2\dn-face-project\frontend\src\pages\Reports.jsx`
- Frontend API client: `D:\DNV2\dn-face-project\frontend\src\utils\api.js`
