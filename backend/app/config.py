from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_data_dir: Path = Path("/data")
    max_upload_mb: int = 500
    mobsf_url: str = "http://mobsf:8000"
    mobsf_api_key: str = ""
    app_api_token: str = ""
    decompiler_worker_token: str = ""
    decompiler_url: str = "http://decompiler:8001"
    decompile_timeout_seconds: int = 3600
    jadx_bin: str = "/usr/local/bin/jadx"
    apktool_bin: str = "/usr/local/bin/apktool"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.app_data_dir.mkdir(parents=True, exist_ok=True)
    (settings.app_data_dir / "uploads").mkdir(exist_ok=True)
    (settings.app_data_dir / "reports").mkdir(exist_ok=True)
    return settings
