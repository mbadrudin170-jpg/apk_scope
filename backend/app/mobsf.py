import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx


class MobSFError(RuntimeError):
    pass


class MobSFClient:
    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    async def analyze(
        self,
        apk_path: Path,
        on_uploaded: Callable[[str], None] | None = None,
    ) -> tuple[str, dict[str, Any]]:
        if not self.api_key:
            raise MobSFError("MOBSF_API_KEY belum dikonfigurasi di backend/.env")

        headers = {"Authorization": self.api_key}
        timeout = httpx.Timeout(1800, connect=20)
        async with httpx.AsyncClient(timeout=timeout) as client:
            with apk_path.open("rb") as apk_file:
                upload = await client.post(
                    f"{self.base_url}/api/v1/upload",
                    headers=headers,
                    files={"file": (apk_path.name, apk_file, "application/vnd.android.package-archive")},
                )
            self._raise_for_status(upload, "MobSF upload")
            upload_data = upload.json()
            file_hash = upload_data.get("hash")
            if not file_hash:
                raise MobSFError("MobSF tidak mengembalikan hash APK")

            if on_uploaded is not None:
                on_uploaded(file_hash)

            scan = await client.post(
                f"{self.base_url}/api/v1/scan",
                headers=headers,
                data={"hash": file_hash},
            )
            self._raise_for_status(scan, "MobSF scan")

            report = await client.post(
                f"{self.base_url}/api/v1/report_json",
                headers=headers,
                data={"hash": file_hash},
            )
            self._raise_for_status(report, "MobSF report")
            try:
                report_data = report.json()
            except json.JSONDecodeError as error:
                raise MobSFError("Respons laporan MobSF bukan JSON valid") from error

            if not isinstance(report_data, dict):
                raise MobSFError("Format laporan MobSF tidak sesuai")
            return file_hash, report_data

    async def delete_scan(self, file_hash: str) -> None:
        if not self.api_key:
            raise MobSFError("MOBSF_API_KEY belum dikonfigurasi di backend/.env")
        if not file_hash:
            raise MobSFError("Hash scan MobSF tidak tersedia")

        headers = {"Authorization": self.api_key}
        timeout = httpx.Timeout(60, connect=20)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/v1/delete_scan",
                headers=headers,
                data={"hash": file_hash},
            )
        self._raise_for_status(response, "MobSF delete scan")

        try:
            result = response.json()
        except json.JSONDecodeError as error:
            raise MobSFError("Respons penghapusan MobSF bukan JSON valid") from error

        deleted = result.get("deleted") if isinstance(result, dict) else None
        if deleted == "yes":
            return
        if isinstance(deleted, str) and "not found" in deleted.lower():
            return
        raise MobSFError(f"MobSF tidak mengonfirmasi penghapusan scan: {deleted!r}")

    @staticmethod
    def _raise_for_status(response: httpx.Response, operation: str) -> None:
        if response.is_error:
            detail = response.text[:500]
            raise MobSFError(f"{operation} gagal ({response.status_code}): {detail}")
