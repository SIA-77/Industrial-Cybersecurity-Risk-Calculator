"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

from lopa_engine import build_lopa_tree, collapse_consequences
from risk_engine import calculate_risk_assessment, compute_group_scores


def test_compute_group_scores_returns_normalized_values():
    scores, errors = compute_group_scores(
        [
            {
                "group_name": "Authentication",
                "questions": [
                    {"id": "Q1", "score": 3, "max_score": 5},
                    {"id": "Q2", "score": 4, "max_score": 5},
                ],
            }
        ]
    )

    assert errors == []
    assert round(scores["Authentication"], 2) == 0.70


def test_calculate_risk_assessment_returns_event_losses():
    layer_map = {
        "base_settings": {
            "min_pfd": 0.005,
            "max_pfd": 0.995,
            "gamma": 1.0,
            "attacker_multiplier": {"low": 1.0, "medium": 1.5, "high": 2.0},
        },
        "layers": {
            "Corporate Network": {"fixed_pfd": 0.1, "is_corporate": True, "weights_by_attacker": {"default": 0.8}},
            "SIS": {"criteria": {"Authentication": 1.0}},
        },
        "criteria_aliases": {},
    }
    maturity_weights = {"weights": {"Authentication": 1.0}, "aliases": {}}

    result = calculate_risk_assessment(
        layers=[
            {"name": "Corporate Network", "pfd": 0.1, "cyber": True},
            {"name": "SIS", "pfd": 0.01, "cyber": True},
        ],
        technical_groups=[
            {
                "group_name": "Authentication",
                "questions": [{"id": "Q1", "score": 4, "max_score": 5}],
            }
        ],
        organizational_groups=[
            {
                "group_name": "Procedures",
                "questions": [{"id": "Q1", "score": 4, "max_score": 5}],
            }
        ],
        attacker_type="external",
        attacker_potential="high",
        layer_map=layer_map,
        maturity_weights=maturity_weights,
        use_monte_carlo=False,
        sis_is_integrated=True,
        event_names=["Cyber incident", "Escalation", "Breach"],
        event_losses=[
            {"sle": "1000", "currency": "USD"},
            {"sle": "5000", "currency": "USD"},
            {"sle": "10000", "currency": "USD"},
        ],
    )

    assert "errors" not in result
    assert len(result["layers"]) == 2
    assert len(result["event_losses"]) == 3
    assert result["maturity_score"] > 0


def test_build_lopa_tree_and_collapse_consequences():
    tree = build_lopa_tree(
        [{"name": "Firewall", "pfd": 0.1}, {"name": "SIS", "pfd": 0.01}]
    )
    collapsed = collapse_consequences(tree)

    assert len(tree["branches"]) == 3
    breach = next(item for item in collapsed if item["outcome"] == "Breach")
    assert round(breach["probability"], 4) == 0.001
