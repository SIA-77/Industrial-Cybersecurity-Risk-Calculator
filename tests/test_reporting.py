"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

from pathlib import Path

from reportlab.pdfbase import pdfmetrics

from reporting.report_builder import _register_pdf_font, generate_report


def test_register_pdf_font_selects_unicode_font():
    font_name = _register_pdf_font()

    assert font_name in {"DejaVuSans", "NotoSans", "LiberationSans", "Helvetica"}
    assert pdfmetrics.getFont(font_name) is not None


def test_generate_report_creates_pdf_with_cyrillic_content():
    path = generate_report(
        report_format="pdf",
        technical_groups=[
            {
                "group_id": "1",
                "group_name": "Технические меры",
                "weight": 1,
                "questions": [{"id": "Q-1", "text": "Проверка кириллицы", "score": 3, "max_score": 5}],
            }
        ],
        organizational_groups=[
            {
                "group_id": "2",
                "group_name": "Организационные меры",
                "weight": 1,
                "questions": [{"id": "Q-2", "text": "Есть ли регламенты?", "score": 4, "max_score": 5}],
            }
        ],
        layers_input=[
            {"name": "Corporate Network", "pfd": 0.1, "cyber": True},
            {"name": "SIS", "pfd": 0.01, "cyber": True},
        ],
        risk_result={
            "maturity_score": 70.0,
            "layers": [
                {
                    "name": "Corporate Network",
                    "base_pfd": 0.1,
                    "degradation_factor": 0.8,
                    "org_multiplier": 1.1,
                    "effective_pfd": 0.11,
                    "effective_pfd_year2": 0.12,
                    "effective_pfd_year3": 0.13,
                },
                {
                    "name": "SIS",
                    "base_pfd": 0.01,
                    "degradation_factor": 0.7,
                    "org_multiplier": 1.1,
                    "effective_pfd": 0.02,
                    "effective_pfd_year2": 0.03,
                    "effective_pfd_year3": 0.04,
                },
            ],
            "event_losses": [
                {
                    "name": "Инцидент 1",
                    "probability_year1": 0.89,
                    "probability_year2": 0.88,
                    "probability_year3": 0.87,
                    "sle": 1000,
                    "currency": "RUB",
                    "loss_year1": 890,
                    "loss_year2": 880,
                    "loss_year3": 870,
                },
                {
                    "name": "Инцидент 2",
                    "probability_year1": 0.09,
                    "probability_year2": 0.08,
                    "probability_year3": 0.07,
                    "sle": 5000,
                    "currency": "RUB",
                    "loss_year1": 450,
                    "loss_year2": 400,
                    "loss_year3": 350,
                },
                {
                    "name": "Нарушение",
                    "probability_year1": 0.02,
                    "probability_year2": 0.04,
                    "probability_year3": 0.06,
                    "sle": 10000,
                    "currency": "RUB",
                    "loss_year1": 200,
                    "loss_year2": 400,
                    "loss_year3": 600,
                },
            ],
        },
        attacker_type="external",
        attacker_potential="high",
        recommendations_text="# Вывод\n**Кириллица** должна отображаться корректно.",
    )

    report_path = Path(path)
    assert report_path.exists()
    assert report_path.suffix == ".pdf"
    assert report_path.stat().st_size > 1000
