#!/usr/bin/env python3
"""
DN FACE - Quick Start Script
Run from dn-face-project/ directory:  python start_backend.py
"""
import subprocess
import sys
import os

project_root = os.path.dirname(__file__)
os.chdir(os.path.join(project_root, 'backend'))

print("=" * 50)
print("  DN FACE Backend")
print("  http://localhost:8000")
print("=" * 50)

args = [
    sys.executable, "-m", "uvicorn",
    "main:app",
    "--host", "0.0.0.0",
    "--port", "8000",
]
# Enable auto-reload only when explicitly requested.
# This avoids Windows named-pipe permission errors in some environments.
if os.environ.get("DN_FACE_RELOAD") == "1":
    args.append("--reload")

env = os.environ.copy()
if env.get("PYTHONPATH"):
    env["PYTHONPATH"] = project_root + os.pathsep + env["PYTHONPATH"]
else:
    env["PYTHONPATH"] = project_root

subprocess.run(args, env=env)
