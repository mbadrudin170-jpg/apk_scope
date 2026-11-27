import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnalysisDatabase:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS analyses (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    status TEXT NOT NULL,
                    progress_message TEXT NOT NULL,
                    error_message TEXT,
                    mobsf_hash TEXT,
                    report_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC)"
            )

    def create(self, item: dict[str, Any]) -> None:
        with self.connect() as connection:
            connection.execute("""
                INSERT INTO analyses (
                    id, filename, file_size, sha256, status, progress_message,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item["id"], item["filename"], item["file_size"], item["sha256"],
                item["status"], item["progress_message"], item["created_at"], item["updated_at"],
            ))

    def update(self, analysis_id: str, **values: Any) -> None:
        if not values:
            return
        allowed = {
            "status", "progress_message", "error_message", "mobsf_hash",
            "report_json", "updated_at",
        }
        if not set(values).issubset(allowed):
            raise ValueError("Unsupported analysis fields")
        values["updated_at"] = utc_now()
        assignments = ", ".join(f"{key} = ?" for key in values)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE analyses SET {assignments} WHERE id = ?",
                (*values.values(), analysis_id),
            )

    @staticmethod
    def serialize(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        report = result.pop("report_json")
        result["report"] = json.loads(report) if report else None
        return result

    def get(self, analysis_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM analyses WHERE id = ?", (analysis_id,)
            ).fetchone()
        return self.serialize(row) if row else None

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM analyses ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self.serialize(row) for row in rows]

    def delete(self, analysis_id: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
            return cursor.rowcount > 0
