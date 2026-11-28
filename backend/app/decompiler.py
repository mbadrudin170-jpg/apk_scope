import json
import logging
import os
import shutil
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

from fastapi import HTTPException

from .config import get_settings

logger = logging.getLogger("apk_scope.decompiler")
settings = get_settings()
DATA_ROOT = settings.app_data_dir
STATUS_NAME = "status.json"
MAX_SOURCE_FILE_BYTES = 1024 * 1024
MAX_SOURCE_FILES = 100_000
ACTIVE_STATUSES = {"queued", "running"}
VALID_TOOLS = {"jadx", "apktool"}
VALID_KINDS = {
    ("jadx", "java"): ".java",
    ("apktool", "smali"): ".smali",
    ("apktool", "xml"): ".xml",
}
_status_lock = threading.Lock()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def analysis_directory(analysis_id: str, data_root: Path | None = None) -> Path:
    try:
        parsed = uuid.UUID(analysis_id)
    except (ValueError, AttributeError) as error:
        raise ValueError("ID analisis tidak valid") from error
    if str(parsed) != analysis_id.lower():
        raise ValueError("ID analisis tidak valid")
    return (data_root or DATA_ROOT) / "decompiled" / str(parsed)


def status_file(analysis_id: str, data_root: Path | None = None) -> Path:
    return analysis_directory(analysis_id, data_root) / STATUS_NAME


def read_decompile_status(
    analysis_id: str, data_root: Path | None = None
) -> dict[str, Any] | None:
    path = status_file(analysis_id, data_root)
    if not path.is_file():
        return None
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.exception("Cannot read decompilation status for %s", analysis_id)
        return None
    return result if isinstance(result, dict) else None


def write_decompile_status(
    analysis_id: str, value: dict[str, Any], data_root: Path | None = None
) -> None:
    directory = analysis_directory(analysis_id, data_root)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / STATUS_NAME
    temporary = directory / f"{STATUS_NAME}.tmp"
    payload = {**value, "updated_at": utc_now()}
    with _status_lock:
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        temporary.replace(path)


def initial_status(analysis_id: str, status: str = "queued") -> dict[str, Any]:
    return {
        "analysis_id": analysis_id,
        "status": status,
        "progress_message": "Menunggu proses dekompilasi",
        "started_at": None,
        "finished_at": None,
        "tools": {
            "jadx": {"status": "queued", "file_count": 0, "error": None},
            "apktool": {"status": "queued", "file_count": 0, "error": None},
        },
        "warnings": [],
        "error_message": None,
    }


def recover_incomplete_jobs(data_root: Path | None = None) -> None:
    root = (data_root or DATA_ROOT) / "decompiled"
    if not root.is_dir():
        return
    for path in root.glob(f"*/{STATUS_NAME}"):
        try:
            status = json.loads(path.read_text(encoding="utf-8"))
            if status.get("status") not in ACTIVE_STATUSES:
                continue
            status["status"] = "failed"
            status["progress_message"] = "Worker dimulai ulang sebelum dekompilasi selesai"
            status["error_message"] = (
                "Proses sebelumnya terhenti saat worker dimulai ulang. Jalankan ulang dekompilasi."
            )
            status["finished_at"] = utc_now()
            path.write_text(
                json.dumps({**status, "updated_at": utc_now()}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except (OSError, json.JSONDecodeError, AttributeError):
            logger.exception("Cannot recover stale decompilation status: %s", path)


def _count_files(root: Path, extension: str) -> int:
    if not root.is_dir():
        return 0
    total = 0
    for item in root.rglob(f"*{extension}"):
        if item.is_file() and not item.is_symlink():
            total += 1
            if total >= MAX_SOURCE_FILES:
                break
    return total


def _run_tool(
    command: list[str], output_directory: Path, extension: str, timeout: int
) -> dict[str, Any]:
    environment = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": "/tmp/decompiler-home",
        "JAVA_TOOL_OPTIONS": "-XX:ActiveProcessorCount=2 -Xmx2048m",
        "LANG": "C.UTF-8",
    }
    Path(environment["HOME"]).mkdir(parents=True, exist_ok=True)
    try:
        result = subprocess.run(
            command,
            cwd=output_directory.parent,
            env=environment,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=timeout,
            check=False,
        )
        file_count = _count_files(output_directory, extension)
        details = (result.stderr or result.stdout or "").strip()[-4000:]
        if result.returncode == 0 and file_count > 0:
            return {"status": "completed", "file_count": file_count, "error": None}
        if file_count > 0:
            return {
                "status": "partial",
                "file_count": file_count,
                "error": details or f"Proses berhenti dengan kode {result.returncode}",
            }
        return {
            "status": "failed",
            "file_count": 0,
            "error": details or f"Proses berhenti dengan kode {result.returncode}",
        }
    except subprocess.TimeoutExpired:
        file_count = _count_files(output_directory, extension)
        return {
            "status": "partial" if file_count else "failed",
            "file_count": file_count,
            "error": f"Melewati batas waktu {timeout} detik.",
        }
    except OSError as error:
        return {
            "status": "failed",
            "file_count": 0,
            "error": str(error)[:1000],
        }


async def run_decompilation(analysis_id: str) -> None:
    import asyncio

    directory = analysis_directory(analysis_id)
    apk_path = DATA_ROOT / "uploads" / f"{analysis_id}.apk"
    jadx_output = directory / "jadx"
    apktool_output = directory / "apktool"
    timeout = max(60, min(settings.decompile_timeout_seconds, 7200))

    status = read_decompile_status(analysis_id) or initial_status(analysis_id)
    status["status"] = "running"
    status["started_at"] = utc_now()
    status["finished_at"] = None
    status["progress_message"] = "Menjalankan JADX dan Apktool pada worker internal"
    status["error_message"] = None
    write_decompile_status(analysis_id, status)

    if not apk_path.is_file():
        status["status"] = "failed"
        status["progress_message"] = "File APK tidak tersedia"
        status["error_message"] = "File APK asli tidak ditemukan pada penyimpanan server."
        status["finished_at"] = utc_now()
        write_decompile_status(analysis_id, status)
        return

    for output in (jadx_output, apktool_output):
        if output.exists():
            shutil.rmtree(output)
        output.mkdir(parents=True, exist_ok=True)

    status["progress_message"] = "Mendekompilasi DEX menjadi Java dengan JADX"
    write_decompile_status(analysis_id, status)
    jadx_result = await asyncio.to_thread(
        _run_tool,
        [
            settings.jadx_bin,
            "--quiet",
            "--threads-count",
            "2",
            "--no-res",
            "--output-dir",
            str(jadx_output),
            str(apk_path),
        ],
        jadx_output / "sources",
        ".java",
        timeout,
    )
    status["tools"]["jadx"] = jadx_result
    status["progress_message"] = "Membongkar Smali dan resource dengan Apktool"
    write_decompile_status(analysis_id, status)

    apktool_result = await asyncio.to_thread(
        _run_tool,
        [
            settings.apktool_bin,
            "d",
            "--force",
            "--output",
            str(apktool_output),
            str(apk_path),
        ],
        apktool_output,
        ".smali",
        timeout,
    )
    status["tools"]["apktool"] = apktool_result

    results = (jadx_result, apktool_result)
    successes = sum(item["status"] == "completed" for item in results)
    partials = sum(item["status"] == "partial" for item in results)
    if successes == 2:
        status["status"] = "completed"
        status["progress_message"] = "Dekompilasi Java, Smali, dan resource selesai"
    elif successes or partials:
        status["status"] = "partial"
        status["progress_message"] = "Dekompilasi selesai sebagian; periksa status setiap alat"
    else:
        status["status"] = "failed"
        status["progress_message"] = "Kedua alat gagal mendekompilasi APK"

    warnings = []
    for tool_name, result in (("JADX", jadx_result), ("Apktool", apktool_result)):
        if result["status"] != "completed":
            warnings.append(f"{tool_name}: {result.get('error') or 'hasil tidak lengkap'}")
    status["warnings"] = warnings
    status["error_message"] = "; ".join(warnings)[:2000] or None
    status["finished_at"] = utc_now()
    write_decompile_status(analysis_id, status)


def _source_root(
    analysis_id: str, tool: str, kind: str, data_root: Path | None = None
) -> tuple[Path, str]:
    extension = VALID_KINDS.get((tool, kind))
    if extension is None:
        raise ValueError("Kombinasi tool dan jenis file tidak didukung")
    directory = analysis_directory(analysis_id, data_root)
    root = directory / "jadx" / "sources" if tool == "jadx" else directory / "apktool"
    return root, extension


def list_source_files(
    analysis_id: str,
    tool: str,
    kind: str,
    query: str = "",
    limit: int = 100,
    offset: int = 0,
    data_root: Path | None = None,
) -> dict[str, Any]:
    root, extension = _source_root(analysis_id, tool, kind, data_root)
    if not root.is_dir():
        return {"items": [], "total": 0, "limit": limit, "offset": offset}
    items: list[dict[str, Any]] = []
    normalized_query = query.casefold()
    root_resolved = root.resolve()
    for path in root.rglob(f"*{extension}"):
        if not path.is_file() or path.is_symlink():
            continue
        resolved = path.resolve()
        try:
            resolved.relative_to(root_resolved)
        except ValueError:
            continue
        relative = path.relative_to(root).as_posix()
        if normalized_query and normalized_query not in relative.casefold():
            continue
        items.append({"path": relative, "name": path.name, "size_bytes": path.stat().st_size})
        if len(items) > MAX_SOURCE_FILES:
            raise HTTPException(status_code=413, detail="Hasil dekompilasi memiliki terlalu banyak file")
    items.sort(key=lambda item: item["path"].casefold())
    total = len(items)
    return {
        "items": items[offset : offset + limit],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def read_source_file(
    analysis_id: str,
    tool: str,
    kind: str,
    file_path: str,
    data_root: Path | None = None,
) -> dict[str, Any]:
    root, extension = _source_root(analysis_id, tool, kind, data_root)
    relative = PurePosixPath(file_path)
    if (
        not file_path
        or "\\" in file_path
        or relative.is_absolute()
        or any(part in {"", ".", ".."} for part in relative.parts)
        or relative.suffix.lower() != extension
    ):
        raise HTTPException(status_code=400, detail="Path atau jenis file tidak valid")

    root_resolved = root.resolve()
    candidate = root.joinpath(*relative.parts)
    if candidate.is_symlink() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="File kode tidak ditemukan")
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Path file berada di luar direktori hasil") from error

    size = resolved.stat().st_size
    if size > MAX_SOURCE_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File terlalu besar untuk ditampilkan sekaligus (maksimal 1 MiB).",
        )
    try:
        content = resolved.read_text(encoding="utf-8", errors="replace")
    except OSError as error:
        logger.exception("Cannot read source file for %s", analysis_id)
        raise HTTPException(status_code=500, detail="Gagal membaca file hasil dekompilasi") from error
    if "\x00" in content:
        raise HTTPException(status_code=415, detail="File bukan teks yang dapat ditampilkan")
    return {
        "path": relative.as_posix(),
        "content": content,
        "size_bytes": size,
        "line_count": content.count("\n") + (1 if content else 0),
        "truncated": False,
    }
