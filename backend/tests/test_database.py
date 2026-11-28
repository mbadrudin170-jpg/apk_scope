from pathlib import Path

from app.database import AnalysisDatabase


def test_class_query_is_applied_with_package_filter(tmp_path: Path) -> None:
    database = AnalysisDatabase(tmp_path / "apk_scope.sqlite3")
    database.initialize()
    database.create(
        {
            "id": "analysis-1",
            "filename": "sample.apk",
            "file_size": 123,
            "sha256": "abc",
            "status": "completed",
            "progress_message": "Selesai",
            "created_at": "2026-11-28T00:00:00+00:00",
            "updated_at": "2026-11-28T00:00:00+00:00",
        }
    )
    database.store_dex_analysis(
        "analysis-1",
        {
            "summary": {},
            "classes": [
                {
                    "name": "com.example.alpha.MainActivity",
                    "package": "com.example.alpha",
                    "dex_file": "classes.dex",
                    "method_count": 2,
                    "methods": [],
                },
                {
                    "name": "com.example.alpha.Helper",
                    "package": "com.example.alpha",
                    "dex_file": "classes.dex",
                    "method_count": 1,
                    "methods": [],
                },
                {
                    "name": "com.example.beta.MainActivity",
                    "package": "com.example.beta",
                    "dex_file": "classes.dex",
                    "method_count": 1,
                    "methods": [],
                },
            ],
            "libraries": [],
        },
    )

    items, total = database.dex_classes(
        "analysis-1",
        query="Helper",
        limit=50,
        offset=0,
        package_name="com.example.alpha",
    )

    assert total == 1
    assert [item["name"] for item in items] == ["com.example.alpha.Helper"]
