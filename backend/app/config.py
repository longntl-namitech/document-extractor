from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    max_bytes: int = 10_000_000
    max_pages: int = 10
    files_per_ip_day: int = 5
    daily_budget_usd: float = 2.0
    doc_budget_usd: float = 0.05
    model_vision: str = "gpt-6-luna"
    model_extract: str = "gpt-6-luna"
    # (input, cached_input, output) USD per 1M tokens
    price_per_mtok: dict[str, tuple[float, float, float]] = {
        "gpt-6-luna": (0.10, 0.01, 0.50),
        "gpt-5.6-luna": (0.20, 0.02, 1.20),
    }
    trusted_proxies: list[str] = []
    data_dir: Path = Path("data")
    openai_api_key: str = ""
