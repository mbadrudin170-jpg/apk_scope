import asyncio
import hashlib
import json
import httpx
import logging
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, UploadFile

from .config import Settings, get_settings
from .database import AnalysisDatabase, utc_now
from .dex import analyze_apk_dex
from .mobsf import MobSFClient, MobSFError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("apk_scope")

settings = get_settings()
database = AnalysisDatabase(settings.app_data_dir / "apk_scope.sqlite3")

app = FastAPI(
    title="APK Scope API",
    version="0.1.0",
    description="Private API for APK Scope personal analysis.",
)
@app.on_event("startup")
def initialize_database() -> None:
    database.initialize()


def require_access(
    authorization: str | None = Header(default=None),
    config: Settings = Depends(get_settings),
) -> None:
    if not config.app_api_token:
        raise HTTPException(status_code=503, detail="APP_API_TOKEN belum dikonfigurasi di backend/.env")
    expected = f"Bearer {config.app_api_token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Token API tidak valid")


def safe_filename(filename: str | None) -> str:
    name = (filename or "application.apk").replace("\\", "/")
    return PurePosixPath(name).name[:180] or "application.apk"


def validate_apk(path: Path, max_bytes: int) -> None:
    if path.stat().st_size < 4:
        raise HTTPException(status_code=400, detail="File terlalu kecil untuk menjadi APK")
    if path.stat().st_size > max_bytes:
        raise HTTPException(status_code=413, detail="Ukuran APK melebihi batas")

    with path.open("rb") as file:
        if file.read(4)[:2] != b"PK":
            raise HTTPException(status_code=400, detail="File bukan arsip APK/ZIP yang valid")

    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 100_000:
                raise HTTPException(status_code=400, detail="APK memiliki terlalu banyak entri")
            names = {entry.filename for entry in entries}
            if "AndroidManifest.xml" not in names or not any(
                name.startswith("classes") and name.endswith(".dex") for name in names
            ):
                raise HTTPException(status_code=400, detail="Arsip tidak memiliki struktur APK")
            expanded_size = 0
            for entry in entries:
                item_path = PurePosixPath(entry.filename)
                if item_path.is_absolute() or ".." in item_path.parts:
                    raise HTTPException(status_code=400, detail="Path berbahaya ditemukan dalam APK")
                expanded_size += entry.file_size
                if expanded_size > max_bytes * 20:
                    raise HTTPException(status_code=413, detail="Ukuran hasil ekstraksi terlalu besar")
                if entry.file_size > 0 and entry.compress_size == 0:
                    raise HTTPException(status_code=400, detail="Entri arsip tidak valid")
                if entry.compress_size and entry.file_size / entry.compress_size > 1000:
                    raise HTTPException(status_code=400, detail="Rasio kompresi arsip tidak wajar")
    except zipfile.BadZipFile as error:
        raise HTTPException(status_code=400, detail="File APK rusak atau bukan ZIP valid") from error


async def run_analysis(analysis_id: str, apk_path: Path) -> None:
    database.update(
        analysis_id,
        status="analyzing",
        progress_message="Mengirim APK ke MobSF dan menjalankan analisis statis",
    )
    try:
        client = MobSFClient(settings.mobsf_url, settings.mobsf_api_key)
        mobsf_hash, report = await client.analyze(
            apk_path,
            on_uploaded=lambda file_hash: database.update(
                analysis_id,
                mobsf_hash=file_hash,
            ),
        )
        database.update(
            analysis_id,
            status="enriching",
            progress_message="Membaca struktur DEX, package, class, dan library",
            mobsf_hash=mobsf_hash,
            report_json=json.dumps(report, ensure_ascii=False),
        )
        dex_result = await asyncio.to_thread(analyze_apk_dex, apk_path)
        await asyncio.to_thread(database.store_dex_analysis, analysis_id, dex_result)
        database.update(
            analysis_id,
            status="completed",
            progress_message="Analisis MobSF dan DEX selesai",
        )
    except (MobSFError, httpx.HTTPError) as error:
        logger.exception("Analysis failed: %s", analysis_id)
        database.update(
            analysis_id,
            status="failed",
            progress_message="Analisis gagal",
            error_message=str(error)[:1000],
        )
    except Exception as error:
        logger.exception("Unexpected analysis error: %s", analysis_id)
        database.update(
            analysis_id,
            status="failed",
            progress_message="Terjadi kesalahan internal",
            error_message=str(error)[:1000],
        )


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mobsf_configured": bool(settings.mobsf_api_key),
        "max_upload_mb": settings.max_upload_mb,
    }


@app.post("/v1/analyses", status_code=202, dependencies=[Depends(require_access)])
async def create_analysis(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    filename = safe_filename(file.filename)
    if not filename.lower().endswith(".apk"):
        raise HTTPException(status_code=415, detail="Hanya file .apk yang didukung")

    analysis_id = str(uuid.uuid4())
    apk_path = settings.app_data_dir / "uploads" / f"{analysis_id}.apk"
    digest = hashlib.sha256()
    size = 0
    try:
        with apk_path.open("wb") as destination:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="Ukuran APK melebihi batas")
                digest.update(chunk)
                destination.write(chunk)
        validate_apk(apk_path, settings.max_upload_bytes)
    except Exception:
        apk_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    now = utc_now()
    database.create({
        "id": analysis_id,
        "filename": filename,
        "file_size": size,
        "sha256": digest.hexdigest(),
        "status": "queued",
        "progress_message": "APK diterima dan menunggu analisis",
        "created_at": now,
        "updated_at": now,
    })
    background_tasks.add_task(run_analysis, analysis_id, apk_path)
    return {
        "id": analysis_id,
        "filename": filename,
        "size": size,
        "sha256": digest.hexdigest(),
        "status": "queued",
    }


@app.get("/v1/analyses", dependencies=[Depends(require_access)])
def list_analyses(limit: int = 50) -> list[dict[str, Any]]:
    return database.list(max(1, min(limit, 100)))


@app.get("/v1/analyses/{analysis_id}", dependencies=[Depends(require_access)])
def get_analysis(analysis_id: str) -> dict[str, Any]:
    result = database.get(analysis_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Analisis tidak ditemukan")
    return result


def _require_analysis(analysis_id: str) -> dict[str, Any]:
    result = database.get(analysis_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Analisis tidak ditemukan")
    if result["status"] != "completed":
        raise HTTPException(status_code=409, detail="Analisis belum selesai")
    return result


def _page_args(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, 200)), max(0, offset)


@app.get("/v1/analyses/{analysis_id}/dex", dependencies=[Depends(require_access)])
def get_dex_summary(analysis_id: str) -> dict[str, Any]:
    result = _require_analysis(analysis_id)
    return result.get("dex_summary") or {
        "status": "unavailable",
        "dex_file_count": 0,
        "package_count": 0,
        "class_count": 0,
        "method_count": 0,
        "library_count": 0,
        "warnings": ["Ringkasan DEX belum tersedia."],
    }


@app.get("/v1/analyses/{analysis_id}/dex/packages", dependencies=[Depends(require_access)])
def get_dex_packages(
    analysis_id: str, q: str = "", limit: int = 50, offset: int = 0
) -> dict[str, Any]:
    _require_analysis(analysis_id)
    page_limit, page_offset = _page_args(limit, offset)
    items, total = database.dex_packages(
        analysis_id, q.strip()[:200], page_limit, page_offset
    )
    return {"items": items, "total": total, "limit": page_limit, "offset": page_offset}


@app.get("/v1/analyses/{analysis_id}/dex/classes", dependencies=[Depends(require_access)])
def get_dex_classes(
    analysis_id: str,
    q: str = "",
    package: str = "",
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    _require_analysis(analysis_id)
    page_limit, page_offset = _page_args(limit, offset)
    items, total = database.dex_classes(
        analysis_id, q.strip()[:200], page_limit, page_offset, package.strip()[:300]
    )
    return {"items": items, "total": total, "limit": page_limit, "offset": page_offset}


@app.get("/v1/analyses/{analysis_id}/dex/methods", dependencies=[Depends(require_access)])
def get_dex_methods(analysis_id: str, class_name: str) -> dict[str, Any]:
    _require_analysis(analysis_id)
    methods = database.dex_methods(analysis_id, class_name)
    if methods is None:
        raise HTTPException(status_code=404, detail="Class tidak ditemukan")
    return {"class_name": class_name, "items": methods, "total": len(methods)}


@app.get("/v1/analyses/{analysis_id}/dex/libraries", dependencies=[Depends(require_access)])
def get_dex_libraries(
    analysis_id: str, q: str = "", limit: int = 50, offset: int = 0
) -> dict[str, Any]:
    _require_analysis(analysis_id)
    page_limit, page_offset = _page_args(limit, offset)
    items, total = database.dex_libraries(
        analysis_id, q.strip()[:200], page_limit, page_offset
    )
    return {"items": items, "total": total, "limit": page_limit, "offset": page_offset}


@app.get("/v1/analyses/{analysis_id}/files", dependencies=[Depends(require_access)])
def get_analysis_files(
    analysis_id: str, q: str = "", limit: int = 100, offset: int = 0
) -> dict[str, Any]:
    _require_analysis(analysis_id)
    apk_path = settings.app_data_dir / "uploads" / f"{analysis_id}.apk"
    if not apk_path.is_file():
        raise HTTPException(status_code=404, detail="File APK tidak tersedia di server")
    page_limit, page_offset = _page_args(limit, offset)
    try:
        with zipfile.ZipFile(apk_path) as archive:
            names = sorted(
                (
                    info.filename
                    for info in archive.infolist()
                    if not info.is_dir() and q.casefold() in info.filename.casefold()
                ),
                key=str.casefold,
            )
    except (OSError, zipfile.BadZipFile) as error:
        logger.exception("Cannot read APK file list for %s", analysis_id)
        raise HTTPException(status_code=500, detail="Gagal membaca daftar file APK") from error
    return {
        "items": names[page_offset:page_offset + page_limit],
        "total": len(names),
        "limit": page_limit,
        "offset": page_offset,
    }


@app.delete("/v1/analyses/{analysis_id}", dependencies=[Depends(require_access)])
async def delete_analysis(analysis_id: str) -> dict[str, bool]:
    result = database.get(analysis_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Analisis tidak ditemukan")

    active_statuses = {"queued", "validating", "analyzing", "enriching"}
    if result["status"] in active_statuses:
        raise HTTPException(
            status_code=409,
            detail="Analisis masih berjalan. Hapus setelah status completed atau failed.",
        )

    mobsf_hash = result.get("mobsf_hash")
    if mobsf_hash:
        try:
            client = MobSFClient(settings.mobsf_url, settings.mobsf_api_key)
            await client.delete_scan(mobsf_hash)
        except (MobSFError, httpx.HTTPError) as error:
            logger.exception("Failed to delete MobSF scan for analysis %s", analysis_id)
            raise HTTPException(
                status_code=502,
                detail="Gagal menghapus hasil di MobSF. Data lokal tidak dihapus.",
            ) from error

    database.delete(analysis_id)
    (settings.app_data_dir / "uploads" / f"{analysis_id}.apk").unlink(missing_ok=True)
    return {"deleted": True}
