from pathlib import Path
from zipfile import ZipFile

from app.dex import analyze_apk_dex


def test_reports_missing_dex_file(tmp_path: Path) -> None:
    apk = tmp_path / "no-dex.apk"
    with ZipFile(apk, "w") as archive:
        archive.writestr("AndroidManifest.xml", b"manifest")

    result = analyze_apk_dex(apk)

    assert result["summary"]["status"] == "unavailable"
    assert result["summary"]["dex_file_count"] == 0
    assert result["summary"]["class_count"] == 0


def test_reports_invalid_dex_without_crashing(tmp_path: Path) -> None:
    apk = tmp_path / "invalid-dex.apk"
    with ZipFile(apk, "w") as archive:
        archive.writestr("AndroidManifest.xml", b"manifest")
        archive.writestr("classes.dex", b"not-a-dex")

    result = analyze_apk_dex(apk)

    assert result["summary"]["status"] == "failed"
    assert result["summary"]["dex_file_count"] == 0
    assert result["summary"]["warnings"]
