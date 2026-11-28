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
                    dex_summary_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(analyses)").fetchall()
            }
            if "dex_summary_json" not in columns:
                connection.execute("ALTER TABLE analyses ADD COLUMN dex_summary_json TEXT")

            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC)"
            )
            connection.execute("""
                CREATE TABLE IF NOT EXISTS dex_classes (
                    analysis_id TEXT NOT NULL,
                    class_name TEXT NOT NULL,
                    package_name TEXT NOT NULL,
                    dex_file TEXT NOT NULL,
                    method_count INTEGER NOT NULL DEFAULT 0,
                    methods_json TEXT NOT NULL DEFAULT '[]',
                    PRIMARY KEY (analysis_id, class_name),
                    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
                )
            """)
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_dex_classes_package "
                "ON dex_classes(analysis_id, package_name)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_dex_classes_name "
                "ON dex_classes(analysis_id, class_name)"
            )
            connection.execute("""
                CREATE TABLE IF NOT EXISTS dex_libraries (
                    analysis_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    confidence TEXT NOT NULL,
                    method TEXT NOT NULL,
                    evidence_count INTEGER NOT NULL DEFAULT 0,
                    evidence_json TEXT NOT NULL DEFAULT '[]',
                    version TEXT,
                    PRIMARY KEY (analysis_id, name),
                    FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
                )
            """)

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
            "report_json", "dex_summary_json", "updated_at",
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
    def serialize(row: sqlite3.Row, include_report: bool = True) -> dict[str, Any]:
        result = dict(row)
        report = result.pop("report_json")
        dex_summary = result.pop("dex_summary_json", None)
        if include_report:
            result["report"] = json.loads(report) if report else None
        result["dex_summary"] = json.loads(dex_summary) if dex_summary else None
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
        return [self.serialize(row, include_report=False) for row in rows]



    def store_dex_analysis(self, analysis_id: str, result: dict[str, Any]) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM dex_classes WHERE analysis_id = ?", (analysis_id,))
            connection.execute("DELETE FROM dex_libraries WHERE analysis_id = ?", (analysis_id,))
            connection.executemany("""
                INSERT OR REPLACE INTO dex_classes (
                    analysis_id, class_name, package_name, dex_file,
                    method_count, methods_json
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                (
                    analysis_id, item["name"], item["package"], item["dex_file"],
                    item["method_count"],
                    json.dumps(item.get("methods", []), ensure_ascii=False),
                )
                for item in result.get("classes", [])
            ))
            connection.executemany("""
                INSERT OR REPLACE INTO dex_libraries (
                    analysis_id, name, category, confidence, method,
                    evidence_count, evidence_json, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                (
                    analysis_id, item["name"], item["category"], item["confidence"],
                    item["method"], item["evidence_count"],
                    json.dumps(item.get("evidence", []), ensure_ascii=False),
                    item.get("version"),
                )
                for item in result.get("libraries", [])
            ))
            connection.execute(
                "UPDATE analyses SET dex_summary_json = ?, updated_at = ? WHERE id = ?",
                (
                    json.dumps(result.get("summary", {}), ensure_ascii=False),
                    utc_now(),
                    analysis_id,
                ),
            )

    def dex_packages(
        self, analysis_id: str, query: str, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        where = "analysis_id = ?"
        parameters: list[Any] = [analysis_id]
        if query:
            where += " AND package_name LIKE ?"
            parameters.append(f"%{query}%")
        with self.connect() as connection:
            total = connection.execute(
                f"SELECT COUNT(*) FROM (SELECT package_name FROM dex_classes WHERE {where} GROUP BY package_name)",
                parameters,
            ).fetchone()[0]
            rows = connection.execute(
                f"""
                SELECT package_name AS name, COUNT(*) AS class_count,
                       SUM(method_count) AS method_count
                FROM dex_classes WHERE {where}
                GROUP BY package_name ORDER BY package_name COLLATE NOCASE
                LIMIT ? OFFSET ?
                """,
                (*parameters, limit, offset),
            ).fetchall()
        return [dict(row) for row in rows], total

    def dex_classes(
        self, analysis_id: str, query: str, limit: int, offset: int,
        package_name: str = "",
    ) -> tuple[list[dict[str, Any]], int]:
        where = "analysis_id = ?"
        parameters: list[Any] = [analysis_id]
        if package_name:
            where += " AND package_name = ?"
            parameters.append(package_name)
        if query:
            where += " AND (class_name LIKE ? OR package_name LIKE ?)"
            parameters.extend((f"%{query}%", f"%{query}%"))
        with self.connect() as connection:
            total = connection.execute(
                f"SELECT COUNT(*) FROM dex_classes WHERE {where}", parameters
            ).fetchone()[0]
            rows = connection.execute(
                f"""
                SELECT class_name AS name, package_name AS package,
                       dex_file, method_count
                FROM dex_classes WHERE {where}
                ORDER BY class_name COLLATE NOCASE LIMIT ? OFFSET ?
                """,
                (*parameters, limit, offset),
            ).fetchall()
        return [dict(row) for row in rows], total

    def dex_libraries(
        self, analysis_id: str, query: str, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        where = "analysis_id = ?"
        parameters: list[Any] = [analysis_id]
        if query:
            where += " AND (name LIKE ? OR category LIKE ?)"
            parameters.extend((f"%{query}%", f"%{query}%"))
        with self.connect() as connection:
            total = connection.execute(
                f"SELECT COUNT(*) FROM dex_libraries WHERE {where}", parameters
            ).fetchone()[0]
            rows = connection.execute(
                f"""
                SELECT name, category, confidence, method, evidence_count,
                       evidence_json, version
                FROM dex_libraries WHERE {where}
                ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?
                """,
                (*parameters, limit, offset),
            ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            item["evidence"] = json.loads(item.pop("evidence_json"))
            items.append(item)
        return items, total

    def dex_methods(self, analysis_id: str, class_name: str) -> list[dict[str, Any]] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT methods_json FROM dex_classes WHERE analysis_id = ? AND class_name = ?",
                (analysis_id, class_name),
            ).fetchone()
        return json.loads(row["methods_json"]) if row else None

    def delete(self, analysis_id: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
            return cursor.rowcount > 0
