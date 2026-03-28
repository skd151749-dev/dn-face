@echo off
set ROOT=%~dp0
cd /d "%ROOT%"
"%ROOT%\.venv\Scripts\python.exe" -m backend.seed_sample_data
