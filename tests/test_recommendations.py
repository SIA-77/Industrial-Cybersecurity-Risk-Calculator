"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

import recommendations


class _FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": "ok"}}]}


class _FakeClient:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.post_calls = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, url, json, headers):
        self.post_calls.append({"url": url, "json": json, "headers": headers})
        return _FakeResponse()


def test_read_env_value_prefers_backend_env(tmp_path, monkeypatch):
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()
    (backend_dir / ".env").write_text("OPENAI_API_KEY=backend-secret\n", encoding="utf-8")
    (tmp_path / ".env").write_text("OPENAI_API_KEY=root-secret\n", encoding="utf-8")

    monkeypatch.setattr(recommendations.os.path, "dirname", lambda _: str(backend_dir))

    assert recommendations._read_env_value("OPENAI_API_KEY") == "backend-secret"


def test_read_env_value_falls_back_to_project_root_env(tmp_path, monkeypatch):
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()
    (tmp_path / ".env").write_text("OPENAI_API_KEY=root-secret\n", encoding="utf-8")

    monkeypatch.setattr(recommendations.os.path, "dirname", lambda _: str(backend_dir))

    assert recommendations._read_env_value("OPENAI_API_KEY") == "root-secret"


def test_fetch_recommendations_uses_key_from_dotenv(tmp_path, monkeypatch):
    backend_dir = tmp_path / "backend"
    config_dir = backend_dir / "config"
    config_dir.mkdir(parents=True)
    (tmp_path / ".env").write_text("OPENAI_API_KEY=test-secret\n", encoding="utf-8")
    requirements_path = config_dir / "report_requirements.md"
    requirements_path.write_text("Use concise recommendations.", encoding="utf-8")

    fake_client = _FakeClient()
    monkeypatch.setattr(recommendations.os.path, "dirname", lambda _: str(backend_dir))
    monkeypatch.setattr(recommendations.httpx, "Client", lambda **kwargs: fake_client)

    result = recommendations.fetch_recommendations(
        payload={"test": True},
        config={
            "api_base_url": "https://example.test/v1/chat/completions",
            "model": "gpt-test",
            "report_requirements_path": str(requirements_path),
            "timeout_seconds": 10,
        },
        user_prompt="Give me actions",
    )

    assert result["content"] == "ok"
    assert fake_client.post_calls[0]["headers"]["Authorization"] == "Bearer test-secret"


def test_load_recommendations_config_returns_empty_for_missing_file(tmp_path):
    missing_path = tmp_path / "missing.json"

    assert recommendations.load_recommendations_config(str(missing_path)) == {}
