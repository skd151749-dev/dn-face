import os
from datetime import date, datetime
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.main import (
    MEDIA_ROOT,
    ScanAttendanceRequest,
    app as api_app,
    db,
    ensure_group_access,
    face_engine,
    require_auth,
    serialize_attendance_state,
    serialize_settings,
    validate_liveness,
)

PROJECT_ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = PROJECT_ROOT / "public"
MEDIA_DIR = Path(MEDIA_ROOT)


def ensure_demo_seed():
    if not os.getenv("VERCEL"):
        return

    from backend.database import Database
    from backend.seed_sample_data import main as seed_sample_data

    db_instance = Database()
    if len(db_instance.get_all_users()) <= 1:
        seed_sample_data()


ensure_demo_seed()

app = FastAPI(title="DN FACE Web App")


def _session_status(current_hhmm: str, late_after: str) -> str:
    return "Late" if current_hhmm >= late_after else "On Time"


def _scan_result_user(user: dict, user_id: str, group: str | None) -> dict:
    return {
        "name": user["name"],
        "role": user["role"],
        "class_dept": user["class_dept"],
        "user_id": user_id,
        "group_name": user.get("group_name") or group,
    }


@app.post("/api/scan-attendance")
def scan_attendance_with_strict_timing(
    req: ScanAttendanceRequest,
    current_user: dict = Depends(require_auth),
):
    """Attendance rules used by the hosted scanner.

    - Recognition is limited to the selected group/section.
    - The first check-in of a session is always accepted.
    - Check-in is marked On Time or Late from the configured late threshold.
    - Checkout is never recorded before the configured checkout time.
    """
    group = (req.group or "").strip() or None
    ensure_group_access(current_user, group)

    if not group:
        return {
            "matched": False,
            "action": "section_required",
            "message": "Please select a section before scanning.",
        }

    if current_user.get("role") != "admin":
        if req.user_id and req.user_id != current_user["user_id"]:
            return {
                "matched": False,
                "action": "wrong_user",
                "message": "You can only scan for your own account.",
            }
        req.user_id = current_user["user_id"]

    validate_liveness(req.liveness_frames)
    embeddings = face_engine.extract_embeddings_from_base64(req.image_base64)
    if not embeddings:
        return {"matched": False, "action": "no_face", "message": "No face detected."}

    if req.user_id:
        if not db.user_in_group(req.user_id, group):
            return {
                "matched": False,
                "action": "wrong_section",
                "message": f"This user is not assigned to section {group}.",
            }
        registered_embeddings = db.get_embeddings_for_user(req.user_id)
    else:
        registered_embeddings = db.get_all_embeddings(group=group)

    if not registered_embeddings:
        return {
            "matched": False,
            "action": "no_registered_faces",
            "message": f"No registered faces are available for section {group}.",
        }

    matches = face_engine.find_matches(embeddings, registered_embeddings)
    if not matches:
        return {
            "matched": False,
            "action": "not_recognized",
            "message": "Face not recognized in the selected section. Please register with Admin.",
        }

    user_id, confidence = max(matches, key=lambda item: item[1])
    if req.user_id and req.user_id != user_id:
        return {
            "matched": False,
            "action": "not_recognized",
            "message": "Face not recognized for this account.",
        }

    user = db.get_user_by_id(user_id)
    if not user or not db.user_in_group(user_id, group):
        return {
            "matched": False,
            "action": "wrong_section",
            "message": f"Recognized user is not assigned to section {group}.",
        }

    now = datetime.now()
    today = date.today().isoformat()
    current_time = now.strftime("%H:%M:%S")
    current_hhmm = now.strftime("%H:%M")
    rules = serialize_settings(db.get_settings() or {})
    existing = db.get_attendance_today(user_id, today)
    user_payload = _scan_result_user(user, user_id, group)
    user_group = user.get("group_name") or group

    if not existing or (not existing.get("morning_check_in") and not existing.get("afternoon_check_in")):
        session = "morning" if current_hhmm < rules["afternoon_check_in"] else "afternoon"
        late_after = rules["morning_late_after"] if session == "morning" else rules["afternoon_late_after"]
        status = _session_status(current_hhmm, late_after)

        db.record_session_checkin(
            user_id,
            today,
            session=session,
            time=current_time,
            status="Present",
            late_status=status,
            session_status=status,
            group_name=user_group,
        )
        db.create_notification(
            "check-in",
            f"{user['name']} completed {session} check-in at {current_time} ({status}).",
            user_id=user_id,
            group_name=user_group,
        )
        updated = db.get_attendance_today(user_id, today)
        return {
            "matched": True,
            "action": f"{session}_checkin",
            "user": user_payload,
            "time": current_time,
            "date": today,
            "status": status,
            "session_status": status,
            "message": f"Check-in successful — {status}.",
            "confidence": round(confidence, 3),
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(updated),
        }

    if existing.get("morning_check_in") and not existing.get("morning_check_out"):
        if current_hhmm < rules["morning_check_out"]:
            return {
                "matched": True,
                "action": "checkout_not_open",
                "user": user_payload,
                "message": f"Check-in is already recorded. Checkout opens at {rules['morning_check_out']}.",
                "checkout_time": rules["morning_check_out"],
                "confidence": round(confidence, 3),
                "time_rules": rules,
                "attendance_state": serialize_attendance_state(existing),
            }

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
            "status": "On Time",
            "message": "Checkout successful — On Time.",
            "confidence": round(confidence, 3),
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(updated),
        }

    if existing.get("morning_check_out") and not existing.get("afternoon_check_in"):
        status = _session_status(current_hhmm, rules["afternoon_late_after"])
        overall_status = "Late" if status == "Late" or existing.get("late_status") == "Late" else "On Time"
        db.record_session_checkin(
            user_id,
            today,
            session="afternoon",
            time=current_time,
            status="Present",
            late_status=overall_status,
            session_status=status,
            group_name=user_group,
        )
        db.create_notification(
            "check-in",
            f"{user['name']} completed afternoon check-in at {current_time} ({status}).",
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
            "status": status,
            "session_status": status,
            "overall_status": overall_status,
            "message": f"Check-in successful — {status}.",
            "confidence": round(confidence, 3),
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(updated),
        }

    if existing.get("afternoon_check_in") and not existing.get("afternoon_check_out"):
        if current_hhmm < rules["afternoon_check_out"]:
            return {
                "matched": True,
                "action": "checkout_not_open",
                "user": user_payload,
                "message": f"Check-in is already recorded. Checkout opens at {rules['afternoon_check_out']}.",
                "checkout_time": rules["afternoon_check_out"],
                "confidence": round(confidence, 3),
                "time_rules": rules,
                "attendance_state": serialize_attendance_state(existing),
            }

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
            "message": "Checkout successful — On Time.",
            "early_leave": "No",
            "confidence": round(confidence, 3),
            "time_rules": rules,
            "attendance_state": serialize_attendance_state(updated),
        }

    return {
        "matched": True,
        "action": "already_done",
        "user": user_payload,
        "message": "Attendance is already completed for today.",
        "confidence": round(confidence, 3),
        "time_rules": rules,
        "attendance_state": serialize_attendance_state(existing),
    }


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

# deployment trigger: attendance timing fix
