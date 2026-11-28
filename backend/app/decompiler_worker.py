import hmac
import logging
import threading
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException

from .config import Settings, get_settings
from .decompiler import (
    analysis_directory,
    initial_status,
    read_decompile_status,
    recover_incomplete_jobs,
    run_decompilation,
    write_decompile_status,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("apk_scope.decompiler_worker")
_active_jobs: set[str] = set()
_active_jobs_lock = threading.Lock()


app = FastAPI(
    title="APK Scope Internal Decompiler",
    version="0.1.0",
    description="Internal-only worker for JADX and Apktool.",
)


@app.on_event("startup")
def recover_worker_jobs() -> None:
    recover_incomplete_jobs()


def require_worker_access(
    token: str | None = Header(default=None, alias="X-Worker-Token"),
    config: Settings = Depends(get_settings),
) -> None:
    expected = config.decompiler_worker_token
    if not expected:
        raise HTTPException(status_code=503, detail="Token worker belum dikonfigurasi")
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Token worker tidak valid")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/internal/decompile/{analysis_id}",
    status_code=202,
    dependencies=[Depends(require_worker_access)],
)
def start_decompilation(
    analysis_id: str, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    try:
        directory = analysis_directory(analysis_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    apk_path = directory.parent.parent / "uploads" / f"{analysis_id}.apk"
    if not apk_path.is_file():
        raise HTTPException(status_code=404, detail="File APK tidak tersedia")

    current = read_decompile_status(analysis_id)
    if current and current.get("status") in {"running", "completed", "partial"}:
        return current

    with _active_jobs_lock:
        if analysis_id in _active_jobs:
            return current or initial_status(analysis_id)
        _active_jobs.add(analysis_id)

    status = initial_status(analysis_id)
    status["progress_message"] = "Permintaan dekompilasi diterima worker"
    write_decompile_status(analysis_id, status)

    async def execute() -> None:
        try:
            await run_decompilation(analysis_id)
        except Exception as error:
            logger.exception("Unexpected decompilation failure: %s", analysis_id)
            status = read_decompile_status(analysis_id) or initial_status(analysis_id)
            status["status"] = "failed"
            status["progress_message"] = "Worker mengalami kesalahan internal"
            status["error_message"] = str(error)[:1000]
            from .decompiler import utc_now
            status["finished_at"] = utc_now()
            write_decompile_status(analysis_id, status)
        finally:
            with _active_jobs_lock:
                _active_jobs.discard(analysis_id)

    background_tasks.add_task(execute)
    return read_decompile_status(analysis_id) or status
