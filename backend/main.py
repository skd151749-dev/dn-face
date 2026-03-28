"""
DN FACE - AI Face Recognition Attendance & School Meal Monitoring System
FastAPI backend entry point.
"""

import os
import sqlite3
import sys
import uuid
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.auth import create_access_token, decode_access_token
from backend.database import Database
from backend.face_engine import FaceEngine
from reports.excel_export import ExcelExporter

MEDIA_ROOT = os.getenv("DNFACE_MEDIA_ROOT") or (os.path.join("/tmp", "dnface-media") if os.getenv("VERCEL") else os.path.join(PROJECT_ROOT, "media"))
LOGO_DIR = os.path.join(MEDIA_ROOT, "logos")
os.makedirs(LOGO_DIR, exist_ok=True)

app = FastAPI(title="DN FACE System", version="1.2.0")
app.mount("/media", StaticFiles(directory=MEDIA_ROOT), name="media")


def parse_allowed_origins() -> List[str]:
    raw = os.getenv("DNFACE_ALLOWED_ORIGINS", "")
    if raw.strip():
        return [item.strip() for item in raw.split(",") if item.strip()]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_allowed_origins(),
    allow_origin_regex=os.getenv("DNFACE_ALLOWED_ORIGIN_REGEX", r"https://.*\.vercel\.app"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database()
face_engine = FaceEngine()
exporter = ExcelExporter()


class LoginRequest(BaseModel):
    identifier: str
    password: str


class RegisterUserRequest(BaseModel):
    name: str
    user_id: str
    role: str
    class_dept: str
    password: str
    sex: Optional[str] = None
    schedule: Optional[str] = None
    group_name: Optional[str] = None


class FaceImageRequest(BaseModel):
    user_id: str
    image_base64: str
    liveness_frames: Optional[List[str]] = None


class ScanAttendanceRequest(BaseModel):
    image_base64: str
    user_id: Optional[str] = None
    group: Optional[str] = None
    liveness_frames: Optional[List[str]] = None


class MealCountRequest(BaseModel):
    image_base64: str
    date: Optional[str] = None
    group: Optional[str] = None


class SettingsRequest(BaseModel):
    morning_check_in: str
    morning_late_after: str
    morning_check_out: str
    afternoon_check_in: str
    afternoon_late_after: str
    afternoon_check_out: str
    logo_url: Optional[str] = None


class GroupCreateRequest(BaseModel):
    name: str


class GroupUpdateRequest(BaseModel):
    name: str


class EarlyCheckoutCreateRequest(BaseModel):
    user_id: str
    reason: str
    group: Optional[str] = None


class EarlyCheckoutReviewRequest(BaseModel):
    status: str


class NotificationReadRequest(BaseModel):
    notification_id: Optional[int] = None


def sanitize_user(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "id": user["id"],
        "name": user["name"],
        "role": user["role"],
        "class_dept": user["class_dept"],
        "group_name": user.get("group_name"),
        "sex": user.get("sex"),
        "schedule": user.get("schedule"),
    }


def add_minutes_to_hhmm(value: str, minutes: int) -> str:
    base = datetime.strptime(value, "%H:%M")
    return (base + timedelta(minutes=minutes)).strftime("%H:%M")


def serialize_settings(settings: dict) -> dict:
    morning_check_in = settings.get("morning_check_in", settings.get("check_in_start", settings.get("checkin_time", "06:30")))
    morning_check_out = settings.get("morning_check_out", "11:30")
    afternoon_check_in = settings.get("afternoon_check_in", "13:30")
    afternoon_check_out = settings.get("afternoon_check_out", settings.get("check_out_time", settings.get("checkout_time", "17:00")))
    morning_late_after = settings.get("morning_late_after", settings.get("late_time", add_minutes_to_hhmm(morning_check_in, 60)))
    afternoon_late_after = settings.get("afternoon_late_after", add_minutes_to_hhmm(afternoon_check_in, 30))
    if morning_late_after > morning_check_out:
        morning_late_after = morning_check_out
    if afternoon_late_after > afternoon_check_out:
        afternoon_late_after = afternoon_check_out
    return {
        "morning_check_in": morning_check_in,
        "morning_late_after": morning_late_after,
        "morning_check_out": morning_check_out,
        "afternoon_check_in": afternoon_check_in,
        "afternoon_late_after": afternoon_late_after,
        "afternoon_check_out": afternoon_check_out,
        # Compatibility aliases for older UI pieces.
        "check_in_start": morning_check_in,
        "late_time": morning_late_after,
        "check_out_time": afternoon_check_out,
        "logo_url": settings.get("logo_url") or "",
    }


def validate_time_value(value: str, label: str) -> str:
    try:
        return datetime.strptime(value, "%H:%M").strftime("%H:%M")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{label} must use HH:MM format") from exc


def validate_time_controls(payload: dict) -> dict:
    normalized = {
        "morning_check_in": validate_time_value(payload["morning_check_in"], "Morning check-in"),
        "morning_late_after": validate_time_value(payload["morning_late_after"], "Morning late threshold"),
        "morning_check_out": validate_time_value(payload["morning_check_out"], "Morning check-out"),
        "afternoon_check_in": validate_time_value(payload["afternoon_check_in"], "Afternoon check-in"),
        "afternoon_late_after": validate_time_value(payload["afternoon_late_after"], "Afternoon late threshold"),
        "afternoon_check_out": validate_time_value(payload["afternoon_check_out"], "Afternoon check-out"),
    }
    if not (
        normalized["morning_check_in"] <= normalized["morning_late_after"] <= normalized["morning_check_out"]
        and normalized["morning_check_out"] < normalized["afternoon_check_in"]
        and normalized["afternoon_check_in"] <= normalized["afternoon_late_after"] <= normalized["afternoon_check_out"]
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Time slots must follow Morning Check-in <= Morning Late After <= Morning Check-out < "
                "Afternoon Check-in <= Afternoon Late After <= Afternoon Check-out"
            ),
        )
    return normalized


def resolve_attendance_phase(time_str: str, settings: dict) -> str:
    rules = serialize_settings(settings)
    if time_str < rules["morning_check_in"]:
        return "before_morning"
    if time_str < rules["morning_check_out"]:
        return "morning_check_in"
    if time_str < rules["afternoon_check_in"]:
        return "morning_check_out"
    if time_str < rules["afternoon_check_out"]:
        return "afternoon_check_in"
    return "afternoon_check_out"


def compute_session_status(time_str: str, late_after: str) -> str:
    return "Late" if time_str >= late_after else "On Time"


def serialize_attendance_state(attendance: Optional[dict]) -> dict:
    row = attendance or {}
    return {
        "morning_check_in": row.get("morning_check_in"),
        "morning_check_out": row.get("morning_check_out"),
        "morning_status": row.get("morning_status"),
        "afternoon_check_in": row.get("afternoon_check_in"),
        "afternoon_check_out": row.get("afternoon_check_out"),
        "afternoon_status": row.get("afternoon_status"),
        "check_in": row.get("check_in"),
        "check_out": row.get("check_out"),
        "late_status": row.get("late_status"),
        "early_leave": row.get("early_leave"),
    }


def require_auth(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token subject")

    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


def require_admin(current_user: dict = Depends(require_auth)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def ensure_group_access(current_user: dict, group: Optional[str]):
    group = (group or "").strip() or None
    if not group or current_user.get("role") == "admin":
        return

    current_group = (current_user.get("group_name") or "").strip()
    if current_group and current_group != group:
        raise HTTPException(status_code=403, detail="You cannot access another group")


def validate_liveness(frames: Optional[List[str]]):
    if not frames:
        raise HTTPException(status_code=422, detail="Live verification is required")
    result = face_engine.validate_liveness_from_base64_frames(frames)
    if not result.get("passed"):
        raise HTTPException(status_code=422, detail="Fake face detected. Please use real person.")
    return result


def build_media_url(request: Request, relative_path: str) -> str:
    if not relative_path:
        return ""
    if relative_path.startswith("http://") or relative_path.startswith("https://"):
        return relative_path
    return str(request.base_url).rstrip("/") + relative_path


@app.post("/login")
def login(req: LoginRequest):
    identifier = (req.identifier or "").strip()
    if not identifier or not req.password:
        raise HTTPException(status_code=400, detail="Identifier and password are required")

    user = db.authenticate(identifier, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(
        {
            "sub": user["user_id"],
            "role": user["role"],
            "group_name": user.get("group_name"),
        }
    )
    return {"success": True, "token": token, "user": sanitize_user(user)}


@app.get("/branding")
def get_branding(request: Request):
    settings = serialize_settings(db.get_settings() or {})
    logo_url = settings.get("logo_url") or ""
    return {
        "app_name": "DN FACE",
        "logo_url": build_media_url(request, logo_url) if logo_url else "",
    }


@app.get("/groups")
def list_groups():
    return {"groups": db.list_groups()}


@app.post("/groups")
def create_group(req: GroupCreateRequest, current_user: dict = Depends(require_admin)):
    try:
        group = db.create_group(req.name)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Group name already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "group": group}


@app.put("/groups/{group_id}")
def update_group(group_id: int, req: GroupUpdateRequest, current_user: dict = Depends(require_admin)):
    try:
        group = db.rename_group(group_id, req.name)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Group name already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": True, "group": group}


@app.delete("/groups/{group_id}")
def remove_group(group_id: int, current_user: dict = Depends(require_admin)):
    try:
        deleted = db.delete_group(group_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Group not found")
    return {"success": True}


@app.post("/branding/logo")
def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_admin),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Please choose an image file")

    extension = os.path.splitext(file.filename)[1].lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp", ".svg"}:
        raise HTTPException(status_code=400, detail="Supported logo formats: PNG, JPG, JPEG, WEBP, SVG")

    filename = f"logo-{uuid.uuid4().hex}{extension}"
    abs_path = os.path.join(LOGO_DIR, filename)
    with open(abs_path, "wb") as handle:
        handle.write(file.file.read())

    relative_url = f"/media/logos/{filename}"
    db.save_settings({"logo_url": relative_url})
    return {"success": True, "logo_url": build_media_url(request, relative_url)}


@app.post("/register-user")
def register_user(req: RegisterUserRequest, current_user: dict = Depends(require_admin)):
    existing = db.get_user_by_id(req.user_id)
    if existing:
        raise HTTPException(status_code=400, detail="User ID already exists")

    db.create_user(
        name=req.name,
        user_id=req.user_id,
        role=req.role,
        class_dept=req.class_dept,
        password=req.password,
        sex=req.sex,
        schedule=req.schedule,
        group_name=req.group_name,
    )
    return {"success": True, "message": f"User {req.name} registered successfully"}


@app.post("/register-face")
def register_face(req: FaceImageRequest, current_user: dict = Depends(require_admin)):
    user = db.get_user_by_id(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    validate_liveness(req.liveness_frames)
    embedding = face_engine.extract_embedding_from_base64(req.image_base64)
    if embedding is None:
        raise HTTPException(status_code=422, detail="No face detected in image")

    db.save_face_embedding(req.user_id, embedding)
    count = db.count_face_embeddings(req.user_id)
    return {"success": True, "images_captured": count, "required": 5}


@app.post("/scan-attendance")
def scan_attendance(req: ScanAttendanceRequest, current_user: dict = Depends(require_auth)):
    group = (req.group or "").strip() or None
    ensure_group_access(current_user, group)
    if current_user.get("role") != "admin":
        if req.user_id and req.user_id != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="You can only scan for your own account")
        req.user_id = current_user["user_id"]

    validate_liveness(req.liveness_frames)
    embeddings = face_engine.extract_embeddings_from_base64(req.image_base64)
    if not embeddings:
        return {"matched": False, "message": "No face detected"}

    if req.user_id:
        if group and not db.user_in_group(req.user_id, group):
            return {"matched": False, "message": "User not in selected group"}
        all_embeddings = db.get_embeddings_for_user(req.user_id)
        if not all_embeddings:
            return {"matched": False, "message": "Face not recognized. Please register with Admin."}
    else:
        all_embeddings = db.get_all_embeddings(group=group)
        if not all_embeddings:
            return {"matched": False, "message": "No registered faces for selected group"}

    matches = face_engine.find_matches(embeddings, all_embeddings)
    if not matches:
        return {"matched": False, "message": "Face not recognized. Please register with Admin."}

    user_id, confidence = max(matches, key=lambda item: item[1])
    if req.user_id and req.user_id != user_id:
        return {"matched": False, "message": "Face not recognized. Please register with Admin."}

    user = db.get_user_by_id(user_id)
    today = date.today().isoformat()
    existing = db.get_attendance_today(user_id, today)
    now = datetime.now()
    settings = db.get_settings() or {}
    rules = serialize_settings(settings)
    current_time = now.strftime("%H:%M:%S")
    current_hhmm = now.strftime("%H:%M")
    phase = resolve_attendance_phase(current_hhmm, rules)
    user_group = user.get("group_name") or group
    user_payload = {
        "name": user["name"],
        "role": user["role"],
        "class_dept": user["class_dept"],
        "user_id": user_id,
        "group_name": user_group,
    }

    if phase == "before_morning":
        return {
            "matched": False,
            "action": "too_early",
            "message": f"Morning check-in opens at {rules['morning_check_in']}",
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(existing),
        }

    if existing and existing.get("afternoon_check_out"):
        return {
            "matched": True,
            "action": "already_done",
            "user": {"name": user["name"], "role": user["role"]},
            "message": "Attendance already completed for today",
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(existing),
        }

    if phase == "morning_check_in":
        if existing and existing.get("morning_check_in"):
            return {
                "matched": True,
                "action": "wait_for_next_window",
                "user": user_payload,
                "message": f"Morning check-in is already recorded. Morning check-out opens at {rules['morning_check_out']}.",
                "time_rules": rules,
                "attendance_state": serialize_attendance_state(existing),
                "confidence": round(confidence, 3),
            }

        session_status = compute_session_status(current_hhmm, rules["morning_late_after"])
        db.record_session_checkin(
            user_id,
            today,
            session="morning",
            time=current_time,
            status="Present",
            late_status=session_status,
            session_status=session_status,
            group_name=user_group,
        )
        db.create_notification(
            "check-in",
            f"{user['name']} completed morning check-in at {current_time} ({session_status}).",
            user_id=user_id,
            group_name=user_group,
        )
        updated = db.get_attendance_today(user_id, today)
        return {
            "matched": True,
            "action": "morning_checkin",
            "user": user_payload,
            "time": current_time,
            "date": today,
            "status": session_status,
            "session_status": session_status,
            "confidence": round(confidence, 3),
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(updated),
        }

    if phase == "morning_check_out":
        if existing and existing.get("morning_check_in") and not existing.get("morning_check_out"):
            db.record_session_checkout(existing["id"], session="morning", time=current_time, early_leave="No")
            db.create_notification(
                "check-out",
                f"{user['name']} completed morning check-out at {current_time}.",
                user_id=user_id,
                group_name=user_group,
            )
            updated = db.get_attendance_today(user_id, today)
            return {
                "matched": True,
                "action": "morning_checkout",
                "user": user_payload,
                "time": current_time,
                "date": today,
                "status": "Morning session completed",
                "confidence": round(confidence, 3),
                "time_rules": rules,
                "attendance_state": serialize_attendance_state(updated),
            }

        waiting_message = f"Afternoon check-in opens at {rules['afternoon_check_in']}."
        if not existing or not existing.get("morning_check_in"):
            waiting_message = f"Morning check-in is closed. Afternoon check-in opens at {rules['afternoon_check_in']}."
        return {
            "matched": False,
            "action": "wait_for_next_window",
            "user": user_payload,
            "message": waiting_message,
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(existing),
        }

    if phase == "afternoon_check_in":
        if not existing or not existing.get("afternoon_check_in"):
            session_status = compute_session_status(current_hhmm, rules["afternoon_late_after"])
            overall_status = "Late" if session_status == "Late" or (existing or {}).get("late_status") == "Late" else "On Time"
            db.record_session_checkin(
                user_id,
                today,
                session="afternoon",
                time=current_time,
                status="Present",
                late_status=overall_status,
                session_status=session_status,
                group_name=user_group,
            )
            db.create_notification(
                "check-in",
                f"{user['name']} completed afternoon check-in at {current_time} ({session_status}).",
                user_id=user_id,
                group_name=user_group,
            )
            updated = db.get_attendance_today(user_id, today)
            return {
                "matched": True,
                "action": "afternoon_checkin",
                "user": user_payload,
                "time": current_time,
                "date": today,
                "status": session_status,
                "session_status": session_status,
                "overall_status": overall_status,
                "confidence": round(confidence, 3),
                "time_rules": rules,
                "attendance_state": serialize_attendance_state(updated),
            }

        latest_request = db.get_latest_early_checkout_request(user_id, today)
        if latest_request and latest_request["status"] == "Approved":
            db.record_session_checkout(existing["id"], session="afternoon", time=current_time, early_leave="Yes")
            db.create_notification(
                "check-out",
                f"{user['name']} checked out early at {current_time} after approval.",
                user_id=user_id,
                group_name=user_group,
            )
            updated = db.get_attendance_today(user_id, today)
            return {
                "matched": True,
                "action": "afternoon_checkout",
                "user": user_payload,
                "time": current_time,
                "date": today,
                "status": "Approved Early Checkout",
                "early_leave": "Yes",
                "confidence": round(confidence, 3),
                "time_rules": rules,
                "attendance_state": serialize_attendance_state(updated),
            }

        if latest_request and latest_request["status"] == "Pending":
            return {
                "matched": True,
                "action": "request_pending",
                "user": user_payload,
                "message": "Your early checkout request is still pending.",
                "request_status": "Pending",
                "time_rules": rules,
                "attendance_state": serialize_attendance_state(existing),
                "confidence": round(confidence, 3),
            }

        return {
            "matched": True,
            "action": "request_required",
            "user": user_payload,
            "message": f"Afternoon checkout opens at {rules['afternoon_check_out']}. Request admin approval to leave earlier.",
            "request_status": latest_request["status"] if latest_request else None,
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(existing),
            "confidence": round(confidence, 3),
        }

    if existing and existing.get("afternoon_check_in") and not existing.get("afternoon_check_out"):
        db.record_session_checkout(existing["id"], session="afternoon", time=current_time, early_leave="No")
        db.create_notification(
            "check-out",
            f"{user['name']} completed afternoon check-out at {current_time}.",
            user_id=user_id,
            group_name=user_group,
        )
        updated = db.get_attendance_today(user_id, today)
        return {
            "matched": True,
            "action": "afternoon_checkout",
            "user": user_payload,
            "time": current_time,
            "date": today,
            "status": "On Time",
            "early_leave": "No",
            "confidence": round(confidence, 3),
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(updated),
        }

    return {
        "matched": False,
        "action": "window_closed",
        "user": user_payload,
        "message": "The attendance window for this session has already closed.",
        "time_rules": rules,
        "attendance_state": serialize_attendance_state(existing),
    }


@app.post("/meal-count")
def meal_count(req: MealCountRequest, current_user: dict = Depends(require_admin)):
    day = req.date or date.today().isoformat()
    group = (req.group or "").strip() or None
    embeddings = face_engine.extract_embeddings_from_base64(req.image_base64)
    if not embeddings:
        return {"success": True, "count": db.get_meal_log_count(day, group), "verified": 0, "date": day}

    all_embeddings = db.get_all_embeddings(group=group)
    if not all_embeddings:
        return {"success": True, "count": db.get_meal_log_count(day, group), "verified": 0, "date": day}

    matches = face_engine.find_matches(embeddings, all_embeddings)
    matched_user_ids = {match[0] for match in matches}
    now = datetime.now()
    verified = 0

    for uid in matched_user_ids:
        if db.get_attendance_today(uid, day):
            if db.log_meal(uid, day, now.strftime("%H:%M:%S"), group_name=group):
                verified += 1
                meal_user = db.get_user_by_id(uid)
                if meal_user:
                    db.create_notification(
                        "meal",
                        f"{meal_user['name']} meal verified for {day}.",
                        user_id=uid,
                        group_name=group or meal_user.get("group_name"),
                    )

    count = db.get_meal_log_count(day, group)
    db.save_meal_count(day, db.get_meal_log_count(day))
    return {"success": True, "count": count, "verified": verified, "date": day}


@app.get("/meal-count/today")
def get_meal_count_today(group: Optional[str] = None, current_user: dict = Depends(require_admin)):
    today = date.today().isoformat()
    return {"date": today, "count": db.get_meal_log_count(today, group)}


@app.get("/meal-monitoring")
def get_meal_monitoring(
    day: Optional[str] = None,
    group: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    target_day = day or date.today().isoformat()
    return {"date": target_day, "rows": db.get_meal_monitoring(target_day, group)}


@app.get("/dashboard-stats")
def dashboard_stats(group: Optional[str] = None, current_user: dict = Depends(require_admin)):
    today = date.today().isoformat()
    return db.get_dashboard_stats(today, group=group)


@app.get("/attendance-report")
def attendance_report(
    period: str = "daily",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    records = db.get_attendance_report(period, start_date, end_date, group=group)
    summary = db.get_report_summary(period, start_date, end_date, group=group)
    return {
        "records": records,
        "count": len(records),
        "summary": summary,
        "filters": {
            "period": period,
            "group": group or "",
            "start_date": start_date,
            "end_date": end_date,
        },
    }


@app.get("/export-report")
def export_report(
    format: str = "excel",
    period: str = "daily",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    records = db.get_attendance_report(period, start_date, end_date, group=group)
    summary = db.get_report_summary(period, start_date, end_date, group=group)
    try:
        filepath = exporter.export(records, period, format=format, group=group, summary=summary)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    requested_format = (format or "excel").strip().lower()
    media_types = {
        "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv": "text/csv",
        "pdf": "application/pdf",
    }
    return FileResponse(
        filepath,
        media_type=media_types.get(requested_format, "application/octet-stream"),
        filename=os.path.basename(filepath),
    )


@app.get("/export-excel")
def export_excel(
    period: str = "daily",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    records = db.get_attendance_report(period, start_date, end_date, group=group)
    summary = db.get_report_summary(period, start_date, end_date, group=group)
    filepath = exporter.export(records, period, format="excel", group=group, summary=summary)
    return FileResponse(
        filepath,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=os.path.basename(filepath),
    )


@app.get("/settings")
def get_settings(current_user: dict = Depends(require_auth)):
    return serialize_settings(db.get_settings() or {})


@app.post("/settings")
def save_settings(req: SettingsRequest, current_user: dict = Depends(require_admin)):
    payload = validate_time_controls(req.model_dump(exclude={"logo_url"}))
    db.save_settings(payload)
    return {"success": True}


@app.post("/early-checkout-requests")
def create_early_checkout_request(
    req: EarlyCheckoutCreateRequest,
    current_user: dict = Depends(require_auth),
):
    if current_user.get("role") != "admin" and req.user_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only request checkout for your own account")

    user = db.get_user_by_id(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    reason = (req.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")

    group = (req.group or user.get("group_name") or "").strip() or None
    ensure_group_access(current_user, group)
    today = date.today().isoformat()
    attendance = db.get_attendance_today(req.user_id, today)
    rules = serialize_settings(db.get_settings() or {})
    current_hhmm = datetime.now().strftime("%H:%M")
    if current_hhmm < rules["afternoon_check_in"]:
        raise HTTPException(status_code=400, detail=f"Early checkout requests open after {rules['afternoon_check_in']}")
    if current_hhmm >= rules["afternoon_check_out"]:
        raise HTTPException(status_code=400, detail="Regular afternoon checkout is already available")
    if not attendance or not attendance.get("afternoon_check_in"):
        raise HTTPException(status_code=400, detail="User must complete afternoon check-in before requesting early checkout")
    if attendance.get("afternoon_check_out"):
        raise HTTPException(status_code=400, detail="User has already checked out for the afternoon")

    latest = db.get_latest_early_checkout_request(req.user_id, today)
    if latest and latest["status"] == "Pending":
        raise HTTPException(status_code=400, detail="An early checkout request is already pending")

    request_row = db.create_early_checkout_request(
        req.user_id,
        group,
        today,
        attendance.get("afternoon_check_in"),
        datetime.now().strftime("%H:%M:%S"),
        reason,
    )
    db.create_notification(
        "request",
        f"Early checkout request from {user['name']}: {reason}",
        user_id=req.user_id,
        group_name=group,
    )
    return {"success": True, "request": request_row}


@app.get("/early-checkout-requests")
def get_early_checkout_requests(
    status: Optional[str] = None,
    group: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    return {"requests": db.get_early_checkout_requests(status=status, group=group)}


@app.post("/early-checkout-requests/{request_id}/review")
def review_early_checkout_request(
    request_id: int,
    req: EarlyCheckoutReviewRequest,
    current_user: dict = Depends(require_admin),
):
    status = (req.status or "").strip().title()
    if status not in {"Approved", "Rejected"}:
        raise HTTPException(status_code=400, detail="Status must be Approved or Rejected")

    row = db.review_early_checkout_request(request_id, status, reviewed_by=current_user["user_id"])
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")

    user = db.get_user_by_id(row["user_id"])
    user_name = user["name"] if user else row["user_id"]
    db.create_notification(
        "request",
        f"Early checkout request for {user_name} was {status.lower()}.",
        user_id=row["user_id"],
        group_name=row.get("group_name"),
    )
    return {"success": True, "request": row}


@app.get("/notifications")
def get_notifications(
    limit: int = 20,
    unread_only: bool = False,
    group: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    if current_user.get("role") != "admin":
        user_id = current_user["user_id"]
        group = current_user.get("group_name") or group
    notifications = db.get_notifications(limit=limit, unread_only=unread_only, group=group, user_id=user_id)
    unread_count = len([item for item in notifications if not item["is_read"]])
    return {"notifications": notifications, "unread_count": unread_count}


@app.post("/notifications/read")
def mark_notifications_read(
    req: NotificationReadRequest,
    group: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    if current_user.get("role") != "admin":
        user_id = current_user["user_id"]
        group = current_user.get("group_name") or group
    if req.notification_id:
        db.mark_notification_read(req.notification_id)
    else:
        db.mark_all_notifications_read(group=group, user_id=user_id)
    return {"success": True}


@app.get("/users")
def list_users(group: Optional[str] = None, current_user: dict = Depends(require_admin)):
    return {"users": db.get_all_users(group=group)}


@app.get("/users/management")
def user_management(group: Optional[str] = None, current_user: dict = Depends(require_admin)):
    today = date.today().isoformat()
    return {"users": db.get_user_management(today, group=group)}


@app.delete("/users/{user_id}")
def delete_user(user_id: str, current_user: dict = Depends(require_admin)):
    try:
        deleted = db.delete_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "success": True,
        "deleted_user": {
            "user_id": deleted["user_id"],
            "name": deleted["name"],
            "group_name": deleted.get("group_name"),
        },
    }


@app.get("/recent-activity")
def recent_activity(
    limit: int = 10,
    user_id: Optional[str] = None,
    group: Optional[str] = None,
    current_user: dict = Depends(require_auth),
):
    if current_user.get("role") != "admin":
        user_id = current_user["user_id"]
        group = current_user.get("group_name") or group
    return {"events": db.get_recent_activity(limit=limit, user_id=user_id, group=group)}


@app.get("/")
def root():
    return {"status": "DN FACE backend running", "version": "1.2.0"}
