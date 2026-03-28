"""
Seed non-destructive sample data for demos and school competition runs.

This script is safe to run multiple times:
- creates users only if they do not exist
- reuses today's attendance rows when already present
- adds a pending early checkout request only if none is pending today
"""

from datetime import date, timedelta

from backend.database import Database


SAMPLE_USERS = [
    {
        "name": "Chan Dara",
        "user_id": "come1_001",
        "role": "student",
        "class_dept": "ComE1",
        "group_name": "ComE1",
        "password": "student123",
        "sex": "Male",
        "schedule": "Morning",
    },
    {
        "name": "Srey Neang",
        "user_id": "come1_002",
        "role": "student",
        "class_dept": "ComE1",
        "group_name": "ComE1",
        "password": "student123",
        "sex": "Female",
        "schedule": "Morning",
    },
    {
        "name": "Vannak Lim",
        "user_id": "come2_001",
        "role": "student",
        "class_dept": "ComE2",
        "group_name": "ComE2",
        "password": "student123",
        "sex": "Male",
        "schedule": "Morning",
    },
    {
        "name": "Sokunthea",
        "user_id": "eng_001",
        "role": "student",
        "class_dept": "English Class",
        "group_name": "English Class",
        "password": "student123",
        "sex": "Female",
        "schedule": "Evening",
    },
]


def ensure_users(db: Database):
    for user in SAMPLE_USERS:
        if not db.get_user_by_id(user["user_id"]):
            db.create_user(**user)


def ensure_attendance(db: Database):
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    for user in SAMPLE_USERS:
        user_id = user["user_id"]
        group_name = user["group_name"]

        if user_id == "eng_001":
            db.record_checkin(user_id, today, "07:45:00", "Late", "Late", group_name=group_name)
        else:
            db.record_checkin(user_id, today, "06:50:00", "On Time", "On Time", group_name=group_name)
        today_row = db.get_attendance_today(user_id, today)

        if user_id != "eng_001" and today_row and not today_row.get("check_out"):
            db.record_checkout(today_row["id"], "17:05:00", "No")

        if not db.get_attendance_today(user_id, yesterday):
            late_status = "Late" if user_id == "come2_001" else "On Time"
            db.record_checkin(user_id, yesterday, "07:35:00" if late_status == "Late" else "06:55:00", late_status, late_status, group_name=group_name)
            yesterday_row = db.get_attendance_today(user_id, yesterday)
            if yesterday_row:
                db.record_checkout(yesterday_row["id"], "17:00:00", "No")


def ensure_meals(db: Database):
    today = date.today().isoformat()
    verified = 0
    for user in SAMPLE_USERS:
        if user["user_id"] == "eng_001":
            continue
        if db.log_meal(user["user_id"], today, "11:45:00", group_name=user["group_name"]):
            verified += 1
    db.save_meal_count(today, db.get_meal_log_count(today))
    return verified


def ensure_request(db: Database):
    today = date.today().isoformat()
    latest = db.get_latest_early_checkout_request("eng_001", today)
    if not latest or latest["status"] != "Pending":
        attendance = db.get_attendance_today("eng_001", today)
        db.create_early_checkout_request(
            "eng_001",
            "English Class",
            today,
            attendance.get("check_in") if attendance else "07:45:00",
            "14:20:00",
            "Need to leave early for a family appointment.",
        )


def ensure_notifications(db: Database):
    if db.get_notifications(limit=1):
        return
    db.create_notification("check-in", "Chan Dara checked in at 06:50:00 (On Time).", user_id="come1_001", group_name="ComE1")
    db.create_notification("meal", "Meal verification completed for ComE1.", group_name="ComE1")
    db.create_notification("request", "Early checkout request from Sokunthea: Need to leave early for a family appointment.", user_id="eng_001", group_name="English Class")


def main():
    db = Database()
    db.save_settings(
        {
            "check_in_start": "06:30",
            "late_time": "07:30",
            "check_out_time": "17:00",
        }
    )
    ensure_users(db)
    ensure_attendance(db)
    verified = ensure_meals(db)
    ensure_request(db)
    ensure_notifications(db)

    print("Sample data ready.")
    print("Admin login: admin001 / admin123")
    print("Student login: come1_001 / student123")
    print(f"Today's meal log count: {db.get_meal_log_count(date.today().isoformat())} (newly added {verified})")


if __name__ == "__main__":
    main()
