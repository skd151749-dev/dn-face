@echo off
set ROOT=%~dp0
cd /d "%ROOT%"
"%ROOT%\.venv\Scripts\python.exe" -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
