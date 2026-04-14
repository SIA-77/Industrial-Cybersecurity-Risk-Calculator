"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

import json
import os

import httpx

from risk_engine import (
    compute_group_scores,
    get_weighted_criteria_score,
    resolve_criteria_group,
    resolve_layer_config,
    _resolve_weight,
    _resolve_attacker_weight,
    resolve_maturity_weight,
    weighted_average,
)


def _read_env_value(key):
    candidates = [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]
    for env_path in candidates:
        if not os.path.exists(env_path):
            continue
        with open(env_path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                env_key, env_value = line.split("=", 1)
                if env_key.strip() != key:
                    continue
                value = env_value.strip().strip('"').strip("'")
                if value:
                    return value
    return ""


def load_recommendations_config(config_path):
    if not os.path.exists(config_path):
        return {}
    with open(config_path, "r", encoding="utf-8") as file_handle:
        return json.load(file_handle)


def _summarize_groups(groups):
    scores, errors = compute_group_scores(groups)
    if errors:
        return {"scores": {}, "errors": errors}
    return {"scores": scores, "errors": []}


def _resolve_layer_criteria(layer_name, layer_map, attacker_type, attacker_potential, sis_is_integrated):
    layer_config = resolve_layer_config(layer_name, layer_map)
    criteria = None
    if layer_config:
        if "scenario_switch" in layer_config:
            switch = layer_config.get("scenario_switch", {})
            flag_value = "true" if sis_is_integrated else "false"
            criteria = switch.get("values", {}).get(flag_value, {}).get("criteria")
        else:
            criteria = layer_config.get("criteria")
    return layer_config, criteria or {}


def build_recommendations_payload(
    layers,
    technical_groups,
    organizational_groups,
    layer_map,
    attacker_type,
    attacker_potential,
    maturity_weights=None,
    sis_is_integrated=True,
):
    technical_summary = _summarize_groups(technical_groups)
    organizational_summary = _summarize_groups(organizational_groups) if organizational_groups else {"scores": {}, "errors": []}
    maturity_score = None
    maturity_level = None
    if not technical_summary["errors"]:
        weight_map = {}
        for name in technical_summary["scores"].keys():
            weight_value = resolve_maturity_weight(name, maturity_weights or {})
            weight_map[name] = weight_value if weight_value is not None else 1.0
        maturity_value = weighted_average(technical_summary["scores"], weight_map)
        if maturity_value is not None:
            maturity_score = round(maturity_value * 100, 1)
            if maturity_score < 25:
                maturity_level = "Critical"
            elif maturity_score < 50:
                maturity_level = "Low"
            elif maturity_score < 75:
                maturity_level = "Medium"
            else:
                maturity_level = "High"

    layer_summaries = []
    for layer in layers:
        layer_name = layer.get("name", "")
        layer_config, criteria = _resolve_layer_criteria(
            layer_name, layer_map, attacker_type, attacker_potential, sis_is_integrated
        )
        criteria_entries = []
        for criteria_name, criteria_value in criteria.items():
            weight = _resolve_weight(criteria_value, attacker_type, attacker_potential)
            if weight is None:
                weight = 1.0
            resolved_group = resolve_criteria_group(criteria_name, technical_summary["scores"], layer_map)
            criteria_entries.append(
                {
                    "criteria": criteria_name,
                    "resolved_group": resolved_group,
                    "weight": weight,
                    "score": technical_summary["scores"].get(resolved_group),
                }
            )
        criteria_score = None
        if layer_config and layer_config.get("is_corporate"):
            criteria_score = _resolve_attacker_weight(
                layer_config.get("weights_by_attacker", {}), attacker_type, attacker_potential
            )
            if criteria_score is None:
                criteria_score = 1.0
        else:
            criteria_score = get_weighted_criteria_score(
                criteria, technical_summary["scores"], layer_map, attacker_type, attacker_potential
            )
        layer_summaries.append(
            {
                "layer": layer_name,
                "criteria_score": criteria_score,
                "criteria": criteria_entries,
            }
        )

    return {
        "attacker": {"type": attacker_type, "potential": attacker_potential},
        "technical_groups": technical_summary,
        "organizational_groups": organizational_summary,
        "maturity": {"score": maturity_score, "level": maturity_level},
        "layers": layer_summaries,
    }


def fetch_recommendations(payload, config, user_prompt=""):
    api_key = _read_env_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("missing_api_key")
    base_url = config.get("api_base_url", "https://api.openai.com/v1/chat/completions")
    model = config.get("model", "gpt-4o-mini")
    system_prompt = config.get("system_prompt", "You are a cybersecurity advisor for ICS risk mitigation.")
    default_user_prompt = config.get("user_prompt", "")
    report_requirements_path = config.get("report_requirements_path", "")
    if not isinstance(report_requirements_path, str) or not report_requirements_path.strip():
        raise ValueError("missing_report_requirements_path")
    resolved_path = report_requirements_path
    if not os.path.isabs(resolved_path):
        resolved_path = os.path.join(os.path.dirname(__file__), report_requirements_path)
    if not os.path.exists(resolved_path):
        raise ValueError("missing_report_requirements_file")
    with open(resolved_path, "r", encoding="utf-8") as handle:
        report_requirements = handle.read()
    prompt = "\n".join(text for text in [default_user_prompt, user_prompt] if text)

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": f"{prompt}\n\nDATA:\n{json.dumps({'payload': payload, 'report_requirements': report_requirements}, ensure_ascii=False, indent=2)}",
        },
    ]
    timeout_seconds = float(config.get("timeout_seconds", 30))
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    proxy = config.get("proxy", "")
    proxy_value = None
    if isinstance(proxy, str) and proxy.strip():
        proxy_value = proxy.strip()
    client_kwargs = {"timeout": timeout_seconds}
    if proxy_value:
        client_kwargs["proxy"] = proxy_value
    with httpx.Client(**client_kwargs) as client:
        response = client.post(
            base_url,
            json={"model": model, "messages": messages},
            headers=headers,
        )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        return {"content": "", "raw": data}
    content = choices[0].get("message", {}).get("content", "")
    return {"content": content, "raw": data}
