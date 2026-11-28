from pathlib import Path
import uuid

import pytest
from fastapi import HTTPException

from app.decompiler import list_source_files, read_source_file


def test_list_and_read_java_source(tmp_path: Path) -> None:
    analysis_id = str(uuid.uuid4())
    source_root = tmp_path / "decompiled" / analysis_id / "jadx" / "sources"
    source_root.mkdir(parents=True)
    source = source_root / "com" / "example" / "MainActivity.java"
    source.parent.mkdir(parents=True)
    source.write_text("package com.example;\nclass MainActivity {}\n", encoding="utf-8")

    result = list_source_files(
        analysis_id, "jadx", "java", data_root=tmp_path
    )
    assert result["total"] == 1
    assert result["items"][0]["path"] == "com/example/MainActivity.java"

    content = read_source_file(
        analysis_id,
        "jadx",
        "java",
        "com/example/MainActivity.java",
        data_root=tmp_path,
    )
    assert "class MainActivity" in content["content"]
    assert content["line_count"] == 2


@pytest.mark.parametrize("unsafe_path", ["../secret.java", "/etc/passwd.java", "com\\..\\secret.java"])
def test_reject_unsafe_source_path(tmp_path: Path, unsafe_path: str) -> None:
    analysis_id = str(uuid.uuid4())
    with pytest.raises(HTTPException) as error:
        read_source_file(
            analysis_id, "jadx", "java", unsafe_path, data_root=tmp_path
        )
    assert error.value.status_code == 400


def test_reject_unsupported_binary_kind(tmp_path: Path) -> None:
    analysis_id = str(uuid.uuid4())
    with pytest.raises(ValueError):
        list_source_files(analysis_id, "jadx", "dex", data_root=tmp_path)
