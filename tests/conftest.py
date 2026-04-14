"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

import io
import os
import sys

import pytest
from fastapi.testclient import TestClient


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from api_main import app  # noqa: E402


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def questionnaire_csv_bytes():
    content = "\n".join(
        [
            "Group;Group Name;Group Weight;Question ID;Question;Score;Max Score;Scoring Guidance;Evidence",
            "1;Network Security;1;Q-1;Проверка кириллицы;3;5;Guide;Evidence",
            "1;Network Security;1;Q-2;Second question;4;5;Guide;Evidence",
        ]
    )
    return content.encode("utf-8")


@pytest.fixture
def questionnaire_upload(questionnaire_csv_bytes):
    return ("questionnaire.csv", io.BytesIO(questionnaire_csv_bytes), "text/csv")


@pytest.fixture
def report_form_payload(questionnaire_csv_bytes):
    files = {
        "technical_questionnaire": ("technical.csv", io.BytesIO(questionnaire_csv_bytes), "text/csv"),
        "organizational_questionnaire": ("organizational.csv", io.BytesIO(questionnaire_csv_bytes), "text/csv"),
    }
    data = {
        "layers": '[{"name":"Corporate Network","pfd":0.1,"cyber":true},{"name":"SIS","pfd":0.01,"cyber":true}]',
        "attacker_type": "external",
        "attacker_potential": "high",
        "use_monte_carlo": "false",
        "sis_is_integrated": "true",
        "event_names": '["Event 1","Event 2","Event 3"]',
        "event_losses": '[{"sle":"1000","currency":"USD","comment":""},{"sle":"2000","currency":"USD","comment":""},{"sle":"3000","currency":"USD","comment":""}]',
        "recommendations": "# Итог\n**Кириллица** должна быть в PDF.",
        "report_format": "pdf",
    }
    return {"files": files, "data": data}
