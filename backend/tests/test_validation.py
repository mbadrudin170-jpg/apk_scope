from pathlib import Path
from zipfile import ZipFile

import pytest
from fastapi import HTTPException

from app.main import validate_apk


def test_rejects_non_zip_file(tmp_path: Path) -> None:
    apk = tmp_path / "invalid.apk"
    apk.write_bytes(b"not an apk")
    with pytest.raises(HTTPException):
        validate_apk(apk, 1024 * 1024)


def test_accepts_minimal_apk_container(tmp_path: Path) -> None:
    apk = tmp_path / "minimal.apk"
    with ZipFile(apk, "w") as archive:
        archive.writestr("AndroidManifest.xml", b"manifest")
        archive.writestr("classes.dex", b"dex")
    validate_apk(apk, 1024 * 1024)
