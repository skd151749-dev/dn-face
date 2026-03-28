"""
DN FACE - Database Module
SQLite database for users, attendance, face embeddings, settings
"""

import sqlite3
import hashlib
import string
import json
import os
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "database", "dnface.db")
DB_PATH = os.getenv("DNFACE_DB_PATH") or ("/tmp/dnface.db" if os.getenv("VERCEL") else DEFAULT_DB_PATH)
DEFAULT_GROUPS = ["ComE1", "ComE2", "English Class"]


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def _looks_hashed(value: str) -> bool:
    if not value or len(value) != 64:
        return False
    return all(ch in string.hexdigits for ch in value)


class Database:
    def __init__(self):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        self._init_tables()
        self._migrate()
        self._seed_admin()
        self._seed_groups()

    def _conn(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     TEXT UNIQUE NOT NULL,
                    name        TEXT NOT NULL,
                    role        TEXT NOT NULL DEFAULT 'student',
                    class_dept  TEXT,
                    password    TEXT NOT NULL,
                    created_at  TEXT DEFAULT (date('now'))
                );

                CREATE TABLE IF NOT EXISTS face_embeddings (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     TEXT NOT NULL,
                    embedding   TEXT NOT NULL,
                    created_at  TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                );

                CREATE TABLE IF NOT EXISTS attendance (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     TEXT NOT NULL,
                    date        TEXT NOT NULL,
                    check_in    TEXT,
                    check_out   TEXT,
                    status      TEXT DEFAULT 'Present',
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                );

                CREATE TABLE IF NOT EXISTS meal_counts (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    date        TEXT UNIQUE NOT NULL,
                    count       INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS meal_logs (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     TEXT NOT NULL,
                    date        TEXT NOT NULL,
                    time        TEXT NOT NULL,
                    UNIQUE(user_id, date),
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key         TEXT PRIMARY KEY,
                    value       TEXT
                );

                CREATE TABLE IF NOT EXISTS groups (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    name        TEXT UNIQUE NOT NULL,
                    created_at  TEXT DEFAULT (datetime('now'))
                );
            """)

    def _migrate(self):
        with self._conn() as conn:
            self._ensure_columns(conn, "users", [
                ("sex", "TEXT"),
                ("schedule", "TEXT"),
                ("group_name", "TEXT"),
            ])
            self._ensure_columns(conn, "attendance", [
                ("group_name", "TEXT"),
                ("late_status", "TEXT"),
                ("early_leave", "TEXT"),
                ("morning_check_in", "TEXT"),
                ("morning_check_out", "TEXT"),
                ("morning_status", "TEXT"),
                ("afternoon_check_in", "TEXT"),
                ("afternoon_check_out", "TEXT"),
                ("afternoon_status", "TEXT"),
            ])
            self._ensure_columns(conn, "meal_logs", [
                ("group_name", "TEXT"),
                ("meal_status", "TEXT"),
            ])
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS early_checkout_requests (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id       TEXT NOT NULL,
                    group_name    TEXT,
                    date          TEXT NOT NULL,
                    check_in_time TEXT,
                    request_time  TEXT NOT NULL,
                    reason        TEXT NOT NULL,
                    status        TEXT NOT NULL DEFAULT 'Pending',
                    reviewed_at   TEXT,
                    reviewed_by   TEXT,
                    created_at    TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                );

                CREATE TABLE IF NOT EXISTS notifications (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    type        TEXT NOT NULL,
                    user_id     TEXT,
                    group_name  TEXT,
                    message     TEXT NOT NULL,
                    is_read     INTEGER NOT NULL DEFAULT 0,
                    created_at  TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS groups (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    name        TEXT UNIQUE NOT NULL,
                    created_at  TEXT DEFAULT (datetime('now'))
                );
            """)
            # Backfill group_name when class_dept already matches a known group
            conn.execute("""
                UPDATE users
                SET group_name = class_dept
                WHERE group_name IS NULL
                  AND class_dept IN ('ComE1','ComE2','English Class')
            """)
            conn.execute("""
                UPDATE attendance
                SET group_name = (
                    SELECT u.group_name
                    FROM users u
                    WHERE u.user_id = attendance.user_id
                )
                WHERE group_name IS NULL
            """)
            conn.execute("""
                UPDATE meal_logs
                SET group_name = (
                    SELECT u.group_name
                    FROM users u
                    WHERE u.user_id = meal_logs.user_id
                )
                WHERE group_name IS NULL
            """)
            conn.execute("""
                UPDATE meal_logs
                SET meal_status = 'Verified'
                WHERE meal_status IS NULL
            """)
            conn.execute("""
                UPDATE attendance
                SET morning_check_in = COALESCE(morning_check_in, check_in)
                WHERE check_in IS NOT NULL
            """)
            conn.execute("""
                UPDATE attendance
                SET morning_status = COALESCE(morning_status, late_status, CASE WHEN status = 'Late' THEN 'Late' ELSE 'On Time' END)
                WHERE morning_check_in IS NOT NULL
            """)
            conn.execute("""
                UPDATE attendance
                SET afternoon_check_out = COALESCE(afternoon_check_out, check_out)
                WHERE check_out IS NOT NULL
            """)
            conn.execute("""
                UPDATE attendance
                SET afternoon_status = COALESCE(afternoon_status, 'On Time')
                WHERE afternoon_check_in IS NOT NULL
            """)
            conn.execute("""
                INSERT OR IGNORE INTO settings (key, value)
                VALUES ('logo_url', '')
            """)
            conn.executemany("""
                INSERT OR IGNORE INTO settings (key, value)
                VALUES (?, ?)
            """, [
                ("morning_late_after", "07:30"),
                ("afternoon_late_after", "14:00"),
            ])

    def _ensure_columns(self, conn: sqlite3.Connection, table: str, columns: List[tuple]):
        existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for name, type_def in columns:
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {type_def}")

    def _normalize_group(self, group: Optional[str]) -> Optional[str]:
        group = (group or "").strip()
        return group if group else None

    def _group_filter(self, group: Optional[str], alias: str = "u"):
        group = self._normalize_group(group)
        if not group:
            return "", []
        clause = f" AND ({alias}.group_name = ? OR ({alias}.group_name IS NULL AND {alias}.class_dept = ?))"
        return clause, [group, group]

    def _seed_admin(self):
        """Create default admin account if none exists."""
        with self._conn() as conn:
            existing = conn.execute(
                "SELECT id, password, role FROM users WHERE user_id = ?",
                ("admin001",),
            ).fetchone()
            if not existing:
                conn.execute(
                    """
                    INSERT INTO users (user_id, name, role, class_dept, password)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    ("admin001", "Administrator", "admin", "Administration", hash_password("admin123")),
                )
                return

            # Ensure admin001 is marked as admin for the default login.
            if existing["role"] != "admin":
                conn.execute("UPDATE users SET role = 'admin' WHERE id = ?", (existing["id"],))

            # If a legacy/plain password is stored, upgrade it to hashed.
            if not _looks_hashed(existing["password"]):
                conn.execute(
                    "UPDATE users SET password = ? WHERE id = ?",
                    (hash_password(existing["password"]), existing["id"]),
                )

    def _seed_groups(self):
        with self._conn() as conn:
            for name in DEFAULT_GROUPS:
                conn.execute("INSERT OR IGNORE INTO groups (name) VALUES (?)", (name,))
            # Pull any legacy group strings into the managed groups table.
            rows = conn.execute("""
                SELECT DISTINCT group_name AS name
                FROM users
                WHERE group_name IS NOT NULL AND TRIM(group_name) != ''
            """).fetchall()
            for row in rows:
                conn.execute("INSERT OR IGNORE INTO groups (name) VALUES (?)", (row["name"],))

    # ── Auth ──────────────────────────────────────

    def authenticate(self, identifier: str, password: str) -> Optional[Dict]:
        identifier = (identifier or "").strip()
        password = password or ""
        if not identifier or not password:
            return None
        hashed = hash_password(password)
        with self._conn() as conn:
            row = conn.execute("""
                SELECT * FROM users
                WHERE (user_id = ? COLLATE NOCASE OR name = ? COLLATE NOCASE)
                LIMIT 1
            """, (identifier, identifier)).fetchone()

            if not row:
                return None

            stored = row["password"] or ""
            if stored == hashed:
                return dict(row)

            # Backward compatibility: accept legacy plaintext passwords and upgrade.
            if stored == password:
                conn.execute("UPDATE users SET password = ? WHERE id = ?", (hashed, row["id"]))
                return dict(row)

        return None

    # ── Users ─────────────────────────────────────

    def list_groups(self) -> List[Dict]:
        with self._conn() as conn:
            rows = conn.execute("""
                SELECT g.id, g.name, g.created_at,
                       (
                           SELECT COUNT(*)
                           FROM users u
                           WHERE u.group_name = g.name
                       ) AS member_count
                FROM groups g
                ORDER BY g.name COLLATE NOCASE
            """).fetchall()
        return [dict(row) for row in rows]

    def create_group(self, name: str) -> Dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("Group name is required")
        with self._conn() as conn:
            existing = conn.execute("SELECT id FROM groups WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
            if existing:
                raise ValueError("Group name already exists")
            conn.execute("INSERT INTO groups (name) VALUES (?)", (name,))
            row = conn.execute("SELECT * FROM groups WHERE name = ?", (name,)).fetchone()
        return dict(row)

    def rename_group(self, group_id: int, name: str) -> Optional[Dict]:
        name = (name or "").strip()
        if not name:
            raise ValueError("Group name is required")
        with self._conn() as conn:
            existing = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
            if not existing:
                return None
            duplicate = conn.execute(
                "SELECT id FROM groups WHERE LOWER(name) = LOWER(?) AND id != ?",
                (name, group_id),
            ).fetchone()
            if duplicate:
                raise ValueError("Group name already exists")
            old_name = existing["name"]
            conn.execute("UPDATE groups SET name = ? WHERE id = ?", (name, group_id))
            conn.execute("UPDATE users SET group_name = ? WHERE group_name = ?", (name, old_name))
            conn.execute("UPDATE attendance SET group_name = ? WHERE group_name = ?", (name, old_name))
            conn.execute("UPDATE meal_logs SET group_name = ? WHERE group_name = ?", (name, old_name))
            conn.execute("UPDATE early_checkout_requests SET group_name = ? WHERE group_name = ?", (name, old_name))
            conn.execute("UPDATE notifications SET group_name = ? WHERE group_name = ?", (name, old_name))
            conn.execute("UPDATE users SET class_dept = ? WHERE class_dept = ?", (name, old_name))
            row = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
        return dict(row) if row else None

    def delete_group(self, group_id: int) -> bool:
        with self._conn() as conn:
            existing = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
            if not existing:
                return False
            group_name = existing["name"]
            in_use = conn.execute(
                "SELECT COUNT(*) AS c FROM users WHERE group_name = ?",
                (group_name,),
            ).fetchone()["c"]
            history_count = conn.execute("""
                SELECT
                    (SELECT COUNT(*) FROM attendance WHERE group_name = ?) +
                    (SELECT COUNT(*) FROM meal_logs WHERE group_name = ?) +
                    (SELECT COUNT(*) FROM early_checkout_requests WHERE group_name = ?) AS c
            """, (group_name, group_name, group_name)).fetchone()["c"]
            if in_use:
                raise ValueError("Cannot delete a group that still has students assigned")
            if history_count:
                raise ValueError("Cannot delete a group that already has attendance, meal, or request history")
            conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
        return True

    def create_user(self, name, user_id, role, class_dept, password, sex: Optional[str] = None, schedule: Optional[str] = None, group_name: Optional[str] = None):
        group_name = self._normalize_group(group_name)
        with self._conn() as conn:
            if group_name:
                conn.execute("INSERT OR IGNORE INTO groups (name) VALUES (?)", (group_name,))
            conn.execute("""
                INSERT INTO users (user_id, name, role, class_dept, password, sex, schedule, group_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, name, role, class_dept, hash_password(password), sex, schedule, group_name))

    def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def get_all_users(self, group: Optional[str] = None) -> List[Dict]:
        group_clause, params = self._group_filter(group, alias="u")
        with self._conn() as conn:
            rows = conn.execute(f"""
                SELECT u.id, u.user_id, u.name, u.role, u.class_dept, u.sex, u.schedule, u.group_name, u.created_at
                FROM users u
                WHERE 1=1 {group_clause}
            """, params).fetchall()
        return [dict(r) for r in rows]

    def delete_user(self, user_id: str) -> Optional[Dict]:
        with self._conn() as conn:
            user = conn.execute(
                "SELECT id, user_id, name, role, group_name FROM users WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if not user:
                return None
            if user["role"] == "admin":
                raise ValueError("Admin accounts cannot be removed from this screen")

            conn.execute("DELETE FROM face_embeddings WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM attendance WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM meal_logs WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM early_checkout_requests WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM notifications WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
        return dict(user)

    # ── Face Embeddings ───────────────────────────

    def save_face_embedding(self, user_id: str, embedding: list):
        with self._conn() as conn:
            conn.execute("""
                INSERT INTO face_embeddings (user_id, embedding)
                VALUES (?, ?)
            """, (user_id, json.dumps(embedding)))

    def count_face_embeddings(self, user_id: str) -> int:
        with self._conn() as conn:
            row = conn.execute("SELECT COUNT(*) as c FROM face_embeddings WHERE user_id = ?", (user_id,)).fetchone()
        return row["c"]

    def get_all_embeddings(self, group: Optional[str] = None) -> List[Dict]:
        """Returns list of {user_id, embedding (as list)} for all users."""
        group_clause, params = self._group_filter(group, alias="u")
        with self._conn() as conn:
            if group_clause:
                rows = conn.execute(f"""
                    SELECT e.user_id, e.embedding
                    FROM face_embeddings e
                    JOIN users u ON e.user_id = u.user_id
                    WHERE 1=1 {group_clause}
                """, params).fetchall()
            else:
                rows = conn.execute("SELECT user_id, embedding FROM face_embeddings").fetchall()
        return [{"user_id": r["user_id"], "embedding": json.loads(r["embedding"])} for r in rows]

    def get_embeddings_for_user(self, user_id: str) -> List[Dict]:
        """Returns list of {user_id, embedding (as list)} for a single user."""
        with self._conn() as conn:
            rows = conn.execute("SELECT user_id, embedding FROM face_embeddings WHERE user_id = ?", (user_id,)).fetchall()
        return [{"user_id": r["user_id"], "embedding": json.loads(r["embedding"])} for r in rows]

    def user_in_group(self, user_id: str, group: Optional[str]) -> bool:
        group = self._normalize_group(group)
        if not group:
            return True
        with self._conn() as conn:
            row = conn.execute("""
                SELECT user_id FROM users
                WHERE user_id = ?
                  AND (group_name = ? OR (group_name IS NULL AND class_dept = ?))
            """, (user_id, group, group)).fetchone()
        return row is not None

    # ── Attendance ────────────────────────────────

    def get_attendance_today(self, user_id: str, today: str) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute("""
                SELECT * FROM attendance WHERE user_id = ? AND date = ?
            """, (user_id, today)).fetchone()
        return dict(row) if row else None

    def _session_columns(self, session: str) -> tuple[str, str, str]:
        if session == "morning":
            return "morning_check_in", "morning_check_out", "morning_status"
        if session == "afternoon":
            return "afternoon_check_in", "afternoon_check_out", "afternoon_status"
        raise ValueError(f"Unsupported attendance session: {session}")

    def record_session_checkin(
        self,
        user_id: str,
        day: str,
        session: str,
        time: str,
        status: str = "Present",
        late_status: Optional[str] = None,
        session_status: Optional[str] = None,
        group_name: Optional[str] = None,
    ):
        checkin_column, _, status_column = self._session_columns(session)
        group_name = self._normalize_group(group_name)
        effective_session_status = (session_status or late_status or "On Time").strip() or "On Time"
        desired_overall_late = "Late" if (late_status == "Late" or effective_session_status == "Late") else (late_status or effective_session_status or "On Time")
        with self._conn() as conn:
            cur = conn.execute(f"""
                INSERT OR IGNORE INTO attendance (
                    user_id, date, {checkin_column}, check_in, status, late_status, {status_column}, group_name
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, day, time, time, status, desired_overall_late, effective_session_status, group_name))
            if cur.rowcount == 0:
                conn.execute(f"""
                    UPDATE attendance
                    SET {checkin_column} = COALESCE({checkin_column}, ?),
                        check_in = CASE
                            WHEN check_in IS NULL OR check_in > ? THEN ?
                            ELSE check_in
                        END,
                        status = COALESCE(status, ?),
                        {status_column} = COALESCE({status_column}, ?),
                        late_status = CASE
                            WHEN COALESCE(late_status, '') = 'Late' OR ? = 'Late' THEN 'Late'
                            WHEN late_status IS NULL OR TRIM(late_status) = '' THEN ?
                            ELSE late_status
                        END,
                        group_name = COALESCE(group_name, ?)
                    WHERE user_id = ? AND date = ?
                """, (time, time, time, status, effective_session_status, desired_overall_late, desired_overall_late, group_name, user_id, day))

    def record_session_checkout(
        self,
        attendance_id: int,
        session: str,
        time: str,
        early_leave: Optional[str] = None,
    ):
        _, checkout_column, _ = self._session_columns(session)
        with self._conn() as conn:
            conn.execute(f"""
                UPDATE attendance
                SET {checkout_column} = COALESCE({checkout_column}, ?),
                    check_out = CASE
                        WHEN check_out IS NULL OR check_out < ? THEN ?
                        ELSE check_out
                    END,
                    early_leave = COALESCE(?, early_leave)
                WHERE id = ?
            """, (time, time, time, early_leave, attendance_id))

    def record_checkin(self, user_id: str, day: str, time: str, status: str, late_status: Optional[str] = None, group_name: Optional[str] = None):
        self.record_session_checkin(
            user_id,
            day,
            session="morning",
            time=time,
            status=status,
            late_status=late_status,
            group_name=group_name,
        )

    def record_checkout(self, attendance_id: int, time: str, early_leave: Optional[str] = None):
        self.record_session_checkout(
            attendance_id,
            session="afternoon",
            time=time,
            early_leave=early_leave,
        )

    def get_latest_early_checkout_request(self, user_id: str, day: str) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute("""
                SELECT *
                FROM early_checkout_requests
                WHERE user_id = ? AND date = ?
                ORDER BY id DESC
                LIMIT 1
            """, (user_id, day)).fetchone()
        return dict(row) if row else None

    def create_early_checkout_request(self, user_id: str, group_name: Optional[str], day: str, check_in_time: Optional[str], request_time: str, reason: str) -> Dict:
        group_name = self._normalize_group(group_name)
        with self._conn() as conn:
            conn.execute("""
                INSERT INTO early_checkout_requests (user_id, group_name, date, check_in_time, request_time, reason, status)
                VALUES (?, ?, ?, ?, ?, ?, 'Pending')
            """, (user_id, group_name, day, check_in_time, request_time, reason))
            request_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            row = conn.execute("SELECT * FROM early_checkout_requests WHERE id = ?", (request_id,)).fetchone()
        return dict(row)

    def review_early_checkout_request(self, request_id: int, status: str, reviewed_by: str) -> Optional[Dict]:
        with self._conn() as conn:
            conn.execute("""
                UPDATE early_checkout_requests
                SET status = ?, reviewed_at = datetime('now'), reviewed_by = ?
                WHERE id = ?
            """, (status, reviewed_by, request_id))
            row = conn.execute("SELECT * FROM early_checkout_requests WHERE id = ?", (request_id,)).fetchone()
        return dict(row) if row else None

    def get_early_checkout_requests(self, status: Optional[str] = None, group: Optional[str] = None) -> List[Dict]:
        params: List[Any] = []
        status_clause = ""
        if status:
            status_clause = "AND r.status = ?"
            params.append(status)
        group_clause, group_params = self._group_filter(group, alias="u")
        params.extend(group_params)
        with self._conn() as conn:
            rows = conn.execute(f"""
                SELECT r.*, u.name, u.class_dept
                FROM early_checkout_requests r
                JOIN users u ON r.user_id = u.user_id
                WHERE 1=1 {status_clause} {group_clause}
                ORDER BY CASE r.status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, r.id DESC
            """, params).fetchall()
        return [dict(r) for r in rows]

    def _resolve_range(self, period: str, start_date=None, end_date=None):
        today = date.today()
        if period == "daily":
            start = end = today
        elif period == "weekly":
            start = today - timedelta(days=today.weekday())
            end = today
        elif period == "monthly":
            start = today.replace(day=1)
            end = today
        else:
            start = date.fromisoformat(start_date) if start_date else today
            end = date.fromisoformat(end_date) if end_date else today
        return start.isoformat(), end.isoformat(), (end - start).days + 1

    def get_attendance_report(self, period: str, start_date=None, end_date=None, group: Optional[str] = None) -> List[Dict]:
        start, end, days = self._resolve_range(period, start_date, end_date)
        group_clause, params = self._group_filter(group, alias="u")

        with self._conn() as conn:
            users = conn.execute(f"""
                SELECT u.name, u.user_id, u.role, u.class_dept, u.sex, u.group_name
                FROM users u
                WHERE u.role != 'admin' {group_clause}
                ORDER BY u.name
            """, params).fetchall()

            attendance_rows = conn.execute(f"""
                SELECT u.name, u.user_id, u.role, u.class_dept, u.sex,
                       COALESCE(a.group_name, u.group_name, u.class_dept) AS group_name,
                       a.date, a.check_in, a.check_out, a.status,
                       a.morning_check_in, a.morning_check_out, a.morning_status,
                       a.afternoon_check_in, a.afternoon_check_out, a.afternoon_status,
                       COALESCE(a.late_status,
                                CASE WHEN a.status = 'Late' THEN 'Late' ELSE 'On Time' END) AS late_status,
                       COALESCE(a.early_leave, 'No') AS early_leave
                FROM attendance a
                JOIN users u ON a.user_id = u.user_id
                WHERE a.date BETWEEN ? AND ? {group_clause}
                ORDER BY a.date DESC, u.name
            """, (start, end, *params)).fetchall()

        attendance_map = {
            (row["user_id"], row["date"]): dict(row)
            for row in attendance_rows
        }
        normalized_users = [dict(row) for row in users]

        report: List[Dict] = []
        current_day = date.fromisoformat(start)
        all_days = []
        for _ in range(days):
            all_days.append(current_day.isoformat())
            current_day += timedelta(days=1)

        for report_day in reversed(all_days):
            for user in normalized_users:
                record = attendance_map.get((user["user_id"], report_day))
                if record:
                    report.append(record)
                    continue

                report.append({
                    "name": user["name"],
                    "user_id": user["user_id"],
                    "role": user["role"],
                    "class_dept": user["class_dept"],
                    "sex": user.get("sex"),
                    "group_name": user.get("group_name") or user.get("class_dept"),
                    "date": report_day,
                    "check_in": None,
                    "check_out": None,
                    "morning_check_in": None,
                    "morning_check_out": None,
                    "morning_status": "Absent",
                    "afternoon_check_in": None,
                    "afternoon_check_out": None,
                    "afternoon_status": "Absent",
                    "status": "Absent",
                    "late_status": "Absent",
                    "early_leave": "No",
                })

        return report

    def get_report_summary(self, period: str, start_date=None, end_date=None, group: Optional[str] = None) -> Dict:
        start, end, days = self._resolve_range(period, start_date, end_date)
        group_clause, params = self._group_filter(group, alias="u")
        with self._conn() as conn:
            total_users = conn.execute(
                f"SELECT COUNT(*) as c FROM users u WHERE role != 'admin' {group_clause}",
                params,
            ).fetchone()["c"]
            present = conn.execute(f"""
                SELECT COUNT(*) as c FROM attendance a
                JOIN users u ON a.user_id = u.user_id
                WHERE a.date BETWEEN ? AND ? {group_clause}
                AND (a.late_status IN ('On Time','Late') OR a.status IN ('Present','Late'))
            """, (start, end, *params)).fetchone()["c"]
            late = conn.execute(f"""
                SELECT COUNT(*) as c FROM attendance a
                JOIN users u ON a.user_id = u.user_id
                WHERE a.date BETWEEN ? AND ? {group_clause}
                AND (
                    a.morning_status = 'Late'
                    OR a.afternoon_status = 'Late'
                    OR a.late_status = 'Late'
                    OR a.status = 'Late'
                )
            """, (start, end, *params)).fetchone()["c"]
        absent = max(0, (total_users * days) - present)
        return {
            "total_users": total_users,
            "present": present,
            "late": late,
            "absent": absent,
            "period_days": days,
            "range": {"start": start, "end": end},
        }

    # ── Meal Count ────────────────────────────────

    def save_meal_count(self, day: str, count: int):
        with self._conn() as conn:
            conn.execute("""
                INSERT INTO meal_counts (date, count) VALUES (?, ?)
                ON CONFLICT(date) DO UPDATE SET count = excluded.count
            """, (day, count))

    def get_meal_count(self, day: str) -> Optional[Dict]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM meal_counts WHERE date = ?", (day,)).fetchone()
        return dict(row) if row else None

    def log_meal(self, user_id: str, day: str, time: str, group_name: Optional[str] = None, meal_status: str = "Verified") -> bool:
        group_name = self._normalize_group(group_name)
        with self._conn() as conn:
            cur = conn.execute("""
                INSERT OR IGNORE INTO meal_logs (user_id, date, time, group_name, meal_status)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, day, time, group_name, meal_status))
        return cur.rowcount > 0

    def get_meal_log_count(self, day: str, group: Optional[str] = None) -> int:
        group_clause, params = self._group_filter(group, alias="u")
        with self._conn() as conn:
            if group_clause:
                row = conn.execute(f"""
                    SELECT COUNT(*) as c
                    FROM meal_logs m
                    JOIN users u ON m.user_id = u.user_id
                    WHERE m.date = ? {group_clause}
                """, (day, *params)).fetchone()
            else:
                row = conn.execute("SELECT COUNT(*) as c FROM meal_logs WHERE date = ?", (day,)).fetchone()
        return row["c"] if row else 0

    def get_meal_monitoring(self, day: str, group: Optional[str] = None) -> List[Dict]:
        group_clause, params = self._group_filter(group, alias="u")
        with self._conn() as conn:
            rows = conn.execute(f"""
                SELECT u.user_id, u.name, u.class_dept, u.group_name,
                       a.check_in,
                       COALESCE(m.meal_status, 'Not Received') AS meal_status,
                       m.time AS meal_time
                FROM users u
                LEFT JOIN attendance a
                  ON a.user_id = u.user_id AND a.date = ?
                LEFT JOIN meal_logs m
                  ON m.user_id = u.user_id AND m.date = ?
                WHERE u.role != 'admin' {group_clause}
                ORDER BY u.name
            """, (day, day, *params)).fetchall()
        return [dict(row) for row in rows]

    def create_notification(self, type: str, message: str, user_id: Optional[str] = None, group_name: Optional[str] = None):
        group_name = self._normalize_group(group_name)
        with self._conn() as conn:
            conn.execute("""
                INSERT INTO notifications (type, user_id, group_name, message, is_read)
                VALUES (?, ?, ?, ?, 0)
            """, (type, user_id, group_name, message))

    def get_notifications(self, limit: int = 20, unread_only: bool = False, group: Optional[str] = None, user_id: Optional[str] = None) -> List[Dict]:
        params: List[Any] = []
        clauses = []
        group = self._normalize_group(group)
        if unread_only:
            clauses.append("n.is_read = 0")
        if group:
            clauses.append("(n.group_name = ? OR n.group_name IS NULL)")
            params.append(group)
        if user_id:
            clauses.append("(n.user_id = ? OR n.user_id IS NULL)")
            params.append(user_id)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._conn() as conn:
            rows = conn.execute(f"""
                SELECT n.*
                FROM notifications n
                {where}
                ORDER BY n.is_read ASC, n.id DESC
                LIMIT ?
            """, (*params, limit)).fetchall()
        return [dict(r) for r in rows]

    def mark_notification_read(self, notification_id: int):
        with self._conn() as conn:
            conn.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notification_id,))

    def mark_all_notifications_read(self, group: Optional[str] = None, user_id: Optional[str] = None):
        params: List[Any] = []
        clauses = []
        group = self._normalize_group(group)
        if group:
            clauses.append("(group_name = ? OR group_name IS NULL)")
            params.append(group)
        if user_id:
            clauses.append("(user_id = ? OR user_id IS NULL)")
            params.append(user_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._conn() as conn:
            conn.execute(f"UPDATE notifications SET is_read = 1 {where}", params)

    # ── Dashboard ─────────────────────────────────

    def get_dashboard_stats(self, today: str, group: Optional[str] = None) -> Dict:
        group_clause, params = self._group_filter(group, alias="u")
        with self._conn() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) as c FROM users u WHERE role != 'admin' {group_clause}",
                params,
            ).fetchone()["c"]
            on_time = conn.execute(f"""
                SELECT COUNT(*) as c FROM attendance a
                JOIN users u ON a.user_id = u.user_id
                WHERE a.date = ? {group_clause} AND (
                    a.late_status = 'On Time' OR a.status = 'Present'
                )
            """, (today, *params)).fetchone()["c"]
            late = conn.execute(f"""
                SELECT COUNT(*) as c FROM attendance a
                JOIN users u ON a.user_id = u.user_id
                WHERE a.date = ? {group_clause} AND (
                    a.late_status = 'Late' OR a.status = 'Late'
                )
            """, (today, *params)).fetchone()["c"]
            present = on_time + late
            meal = self.get_meal_log_count(today, group)

            # Weekly attendance for chart
            weekly = []
            for i in range(6, -1, -1):
                d = (date.today() - timedelta(days=i)).isoformat()
                row = conn.execute(f"""
                    SELECT COUNT(*) as c FROM attendance a
                    JOIN users u ON a.user_id = u.user_id
                    WHERE a.date = ? {group_clause} AND (
                        a.late_status IN ('On Time','Late') OR a.status IN ('Present','Late')
                    )
                """, (d, *params)).fetchone()
                weekly.append({"date": d, "count": row["c"]})

        return {
            "total_users": total,
            "present_today": present,
            "on_time_today": on_time,
            "late_today": late,
            "absent_today": max(0, total - present),
            "meal_count": meal,
            "weekly_attendance": weekly,
        }

    # ── Settings ──────────────────────────────────

    def get_settings(self) -> Dict:
        with self._conn() as conn:
            rows = conn.execute("SELECT key, value FROM settings").fetchall()
        return {r["key"]: r["value"] for r in rows} if rows else {}

    def save_settings(self, settings: Dict):
        with self._conn() as conn:
            for key, value in settings.items():
                conn.execute("""
                    INSERT INTO settings (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """, (key, str(value)))

    # â”€â”€ Admin/User Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def get_user_management(self, today: str, group: Optional[str] = None) -> List[Dict]:
        group_clause, params = self._group_filter(group, alias="u")
        with self._conn() as conn:
            users = conn.execute(f"""
                SELECT id, user_id, name, role, class_dept, sex, schedule, group_name, created_at
                FROM users u
                WHERE role != 'admin' {group_clause}
                ORDER BY name
            """, params).fetchall()

            attendance_today = conn.execute(f"""
                SELECT a.user_id, a.date, a.check_in, a.check_out,
                       a.morning_check_in, a.morning_check_out, a.morning_status,
                       a.afternoon_check_in, a.afternoon_check_out, a.afternoon_status,
                       COALESCE(a.late_status, CASE WHEN a.status = 'Late' THEN 'Late' ELSE 'On Time' END) AS late_status,
                       COALESCE(a.early_leave, 'No') AS early_leave
                FROM attendance a
                JOIN users u ON a.user_id = u.user_id
                WHERE a.date = ? {group_clause}
            """, (today, *params)).fetchall()

            history = conn.execute(f"""
                SELECT a.user_id,
                    SUM(CASE WHEN a.morning_status = 'Late' OR a.afternoon_status = 'Late' OR a.late_status = 'Late' OR a.status = 'Late' THEN 1 ELSE 0 END) AS late_count,
                    SUM(CASE WHEN a.early_leave = 'Yes' THEN 1 ELSE 0 END) AS early_leave_count
                FROM attendance a
                JOIN users u ON a.user_id = u.user_id
                WHERE 1=1 {group_clause}
                GROUP BY a.user_id
            """, params).fetchall()

        att_map = {r["user_id"]: dict(r) for r in attendance_today}
        hist_map = {r["user_id"]: dict(r) for r in history}

        result = []
        for u in users:
            row = dict(u)
            att = att_map.get(u["user_id"], {})
            hist = hist_map.get(u["user_id"], {})
            row.update({
                "attendance_date": att.get("date"),
                "check_in": att.get("check_in"),
                "check_out": att.get("check_out"),
                "morning_check_in": att.get("morning_check_in"),
                "morning_check_out": att.get("morning_check_out"),
                "morning_status": att.get("morning_status"),
                "afternoon_check_in": att.get("afternoon_check_in"),
                "afternoon_check_out": att.get("afternoon_check_out"),
                "afternoon_status": att.get("afternoon_status"),
                "late_status": att.get("late_status"),
                "early_leave": att.get("early_leave"),
                "late_count": hist.get("late_count", 0) or 0,
                "early_leave_count": hist.get("early_leave_count", 0) or 0,
            })
            result.append(row)
        return result

    def get_recent_activity(self, limit: int = 10, user_id: Optional[str] = None, group: Optional[str] = None) -> List[Dict]:
        with self._conn() as conn:
            params = []
            user_filter = ""
            if user_id:
                user_filter = "AND a.user_id = ?"
                params.append(user_id)
            group_clause, group_params = self._group_filter(group, alias="u")
            params = params + group_params

            attendance_rows = conn.execute(f"""
                SELECT u.name, u.user_id, u.class_dept,
                       a.date, a.check_in, a.check_out,
                       a.morning_check_in, a.morning_check_out, a.morning_status,
                       a.afternoon_check_in, a.afternoon_check_out, a.afternoon_status,
                       COALESCE(a.late_status, CASE WHEN a.status = 'Late' THEN 'Late' ELSE 'On Time' END) AS late_status,
                       COALESCE(a.early_leave, 'No') AS early_leave
                FROM attendance a
                JOIN users u ON a.user_id = u.user_id
                WHERE 1=1 {user_filter} {group_clause}
                ORDER BY a.date DESC, a.check_in DESC
                LIMIT 50
            """, params).fetchall()

            meal_params = []
            meal_filter = ""
            if user_id:
                meal_filter = "AND m.user_id = ?"
                meal_params.append(user_id)
            meal_params = meal_params + group_params

            meal_rows = conn.execute(f"""
                SELECT u.name, u.user_id, u.class_dept,
                       m.date, m.time
                FROM meal_logs m
                JOIN users u ON m.user_id = u.user_id
                WHERE 1=1 {meal_filter} {group_clause}
                ORDER BY m.date DESC, m.time DESC
                LIMIT 50
            """, meal_params).fetchall()

        events = []
        for r in attendance_rows:
            row = dict(r)
            attendance_events = [
                ("morning_check_in", "checkin", "Morning Check-in", row.get("morning_status") or row.get("late_status") or "On Time"),
                ("morning_check_out", "checkout", "Morning Check-out", "Completed"),
                ("afternoon_check_in", "checkin", "Afternoon Check-in", row.get("afternoon_status") or "On Time"),
                ("afternoon_check_out", "checkout", "Afternoon Check-out", "Leave Early" if row.get("early_leave") == "Yes" else "On Time"),
            ]
            for field, event_type, action, status in attendance_events:
                scan_time = row.get(field)
                if not scan_time:
                    continue
                events.append({
                    "type": event_type,
                    "action": action,
                    "name": row["name"],
                    "user_id": row["user_id"],
                    "class_dept": row["class_dept"],
                    "date": row["date"],
                    "check_in": scan_time if event_type == "checkin" else None,
                    "check_out": scan_time if event_type == "checkout" else None,
                    "scan_time": scan_time,
                    "status": status,
                    "sort_time": f"{row['date']} {scan_time}",
                })

        for r in meal_rows:
            row = dict(r)
            scan_time = row["time"]
            events.append({
                "type": "meal",
                "action": "Meal",
                "name": row["name"],
                "user_id": row["user_id"],
                "class_dept": row["class_dept"],
                "date": row["date"],
                "check_in": None,
                "check_out": None,
                "scan_time": scan_time,
                "status": "Meal Verified",
                "sort_time": f"{row['date']} {scan_time}",
            })

        events.sort(key=lambda e: e.get("sort_time", ""), reverse=True)
        for e in events:
            e.pop("sort_time", None)
        return events[:limit]
