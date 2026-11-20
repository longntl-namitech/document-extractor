from app.config import Settings


def test_defaults_match_spec(monkeypatch):
    for name in ("DAILY_BUDGET_USD", "DOC_BUDGET_USD", "MAX_PAGES", "MAX_BYTES", "FILES_PER_IP_DAY"):
        monkeypatch.delenv(name, raising=False)
    s = Settings(_env_file=None)
    assert s.max_bytes == 10_000_000
    assert s.max_pages == 10
    assert s.files_per_ip_day == 5
    assert s.daily_budget_usd == 2.0
    assert s.doc_budget_usd == 0.05
    assert s.model_vision == "gpt-6-luna"
    assert s.model_extract == "gpt-6-luna"
    assert s.price_per_mtok["gpt-6-luna"] == (0.10, 0.01, 0.50)


def test_env_overrides_budget(monkeypatch):
    monkeypatch.setenv("DAILY_BUDGET_USD", "5")
    assert Settings(_env_file=None).daily_budget_usd == 5.0
