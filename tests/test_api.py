"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

import io

from api_main import _parse_cors_origins


def _build_large_questionnaire(rows):
    header = "Group;Group Name;Group Weight;Question ID;Question;Score;Max Score;Scoring Guidance;Evidence"
    body = [
        f"1;Group;1;Q-{idx};Question {idx};1;1;Guide;Evidence"
        for idx in range(1, rows + 1)
    ]
    return "\n".join([header, *body]).encode("utf-8")


def test_parse_questionnaire_endpoint_returns_group_data(client, questionnaire_upload):
    response = client.post("/api/v1/questionnaire/parse", files={"file": questionnaire_upload})

    assert response.status_code == 200
    payload = response.json()
    assert payload["question_count"] == 2
    assert payload["groups"][0]["questions"][0]["text"] == "Проверка кириллицы"


def test_parse_questionnaire_rejects_more_than_300_rows(client):
    payload = _build_large_questionnaire(301)

    response = client.post(
        "/api/v1/questionnaire/parse",
        files={"file": ("questionnaire.csv", io.BytesIO(payload), "text/csv")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "questionnaire_too_many_rows"


def test_submit_model_rejects_more_than_300_rows(client):
    header = "col1;col2"
    rows = [f"{idx};value-{idx}" for idx in range(301)]
    csv_payload = "\n".join([header, *rows]).encode("utf-8")

    response = client.post(
        "/api/v1/submit_model",
        files={"file": ("model.csv", io.BytesIO(csv_payload), "text/csv")},
        data={
            "layers": '[{"name":"Firewall","pfd":0.1,"cyber":true}]',
            "attacker_type": "internal",
            "attacker_potential": "low",
            "use_monte_carlo": "false",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "model_too_many_rows"


def test_recommendations_config_does_not_expose_secret_fields(client):
    response = client.get("/api/v1/recommendations/config")

    assert response.status_code == 200
    payload = response.json()
    assert "user_prompt" in payload
    assert "model" in payload
    assert "api_key" not in payload


def test_build_lopa_returns_expected_structure(client):
    response = client.post(
        "/api/v1/lopa",
        json={"layers": [{"name": "Firewall", "pfd": 0.1}, {"name": "SIS", "pfd": 0.01}], "export": False},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "branches" in payload
    assert "collapsed" in payload
    assert payload["breach_probability"] >= 0


def test_report_endpoint_generates_pdf(client, report_form_payload):
    response = client.post("/api/v1/report", files=report_form_payload["files"], data=report_form_payload["data"])

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 1000


def test_parse_cors_origins_defaults_to_local_only():
    origins = _parse_cors_origins(None)

    assert origins == ["http://localhost:3000", "http://127.0.0.1:3000"]


def test_parse_cors_origins_supports_csv_value():
    origins = _parse_cors_origins("http://localhost:3000, http://127.0.0.1:3000")

    assert origins == ["http://localhost:3000", "http://127.0.0.1:3000"]
