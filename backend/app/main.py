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
        mobsf_hash, report = await client.analyze(apk_path)
        database.update(
            analysis_id,
            status="completed",
            progress_message="Analisis selesai",
            mobsf_hash=mobsf_hash,
            report_json=json.dumps(report, ensure_ascii=False),
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


@app.delete("/v1/analyses/{analysis_id}", dependencies=[Depends(require_access)])
def delete_analysis(analysis_id: str) -> dict[str, bool]:
    result = database.get(analysis_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Analisis tidak ditemukan")
    database.delete(analysis_id)
    (settings.app_data_dir / "uploads" / f"{analysis_id}.apk").unlink(missing_ok=True)
    return {"deleted": True}
