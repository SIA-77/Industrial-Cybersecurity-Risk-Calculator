"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

import math


def calculate_risk(
    excel_data,
    layers,
    attacker_type=None,
    attacker_potential=None,
    use_monte_carlo=False,
):
    # Legacy placeholder for older endpoint usage.
    p_total = 1.0
    for layer in layers:
        pfd = float(layer.get("pfd", 1))
        p_total *= pfd
    damage_estimate = p_total * 1_000_000
    return {
        "attack_probability": round(p_total, 6),
        "expected_damage": round(damage_estimate, 2),
        "attacker_type": attacker_type,
        "attacker_potential": attacker_potential,
        "use_monte_carlo": use_monte_carlo,
    }


def _normalize_group_score(score, max_score):
    if max_score <= 0:
        return None
    return max(min(score / max_score, 1.0), 0.0)


def compute_group_scores(groups):
    group_scores = {}
    group_counts = {}
    errors = []
    for group in groups:
        questions = group.get("questions", [])
        if not questions:
            errors.append({"group": group.get("group_name"), "error": "no_questions"})
            continue
        total_score = 0.0
        total_max = 0.0
        for q in questions:
            if q.get("score") is None:
                errors.append({"group": group.get("group_name"), "question": q.get("id"), "error": "missing_score"})
                continue
            if q.get("max_score") is None:
                errors.append({"group": group.get("group_name"), "question": q.get("id"), "error": "missing_max_score"})
                continue
            total_score += float(q.get("score") or 0)
            total_max += float(q.get("max_score") or 0)
        normalized = _normalize_group_score(total_score, total_max)
        if normalized is None:
            errors.append({"group": group.get("group_name"), "error": "invalid_max_score"})
            continue
        group_name = group.get("group_name")
        if group_name in group_scores:
            current_count = group_counts.get(group_name, 1)
            group_scores[group_name] = (group_scores[group_name] * current_count + normalized) / (
                current_count + 1
            )
            group_counts[group_name] = current_count + 1
        else:
            group_scores[group_name] = normalized
            group_counts[group_name] = 1
    return group_scores, errors


def calculate_organizational_multiplier(org_groups, a=1.5, b=4.0, max_factor=3.0):
    if not org_groups:
        return 1.0
    total_score = 0.0
    total_max = 0.0
    for group in org_groups:
        for question in group.get("questions", []):
            score = question.get("score")
            max_score = question.get("max_score")
            if score is None or max_score is None:
                continue
            total_score += float(score)
            total_max += float(max_score)
    if total_max <= 0:
        return 1.0
    normalized = max(min(total_score / total_max, 1.0), 0.0)
    multiplier = a * math.exp(-b * normalized) + 1
    return min(max(multiplier, 1.0), max_factor)


def weighted_average(scores, weights):
    if not scores:
        return None
    total_weight = 0.0
    total_value = 0.0
    for name, value in scores.items():
        weight = weights.get(name, 1.0)
        total_value += value * weight
        total_weight += weight
    if total_weight <= 0:
        return None
    return total_value / total_weight


def _normalize_key(value):
    return "".join(ch.lower() for ch in value if ch.isalnum())


def resolve_layer_config(layer_name, config):
    layers_config = config.get("layers", {})
    target_key = _normalize_key(layer_name)
    for name, entry in layers_config.items():
        if _normalize_key(name) == target_key:
            return entry
        for alias in entry.get("aliases", []):
            if _normalize_key(alias) == target_key:
                return entry
    return None


def _is_corporate_layer(layer_config, layer_name):
    if isinstance(layer_config, dict) and layer_config.get("is_corporate"):
        return True
    return _normalize_key(layer_name) == _normalize_key("Corporate Network")


def resolve_criteria_group(criteria_name, group_scores, config):
    aliases = config.get("criteria_aliases", {})
    candidates = [criteria_name] + aliases.get(criteria_name, [])
    normalized = {_normalize_key(name): name for name in group_scores.keys()}
    for candidate in candidates:
        key = _normalize_key(candidate)
        if key in normalized:
            return normalized[key]
    return None


def _resolve_weight(criteria_value, attacker_type, attacker_potential):
    if isinstance(criteria_value, (int, float)):
        return float(criteria_value)
    if isinstance(criteria_value, dict):
        weights_by_attacker = criteria_value.get("weights_by_attacker", {})
        attacker_key = f"{attacker_type}:{attacker_potential}"
        if attacker_key in weights_by_attacker:
            return float(weights_by_attacker[attacker_key])
        if "default" in criteria_value:
            return float(criteria_value["default"])
    return None


def _resolve_attacker_weight(weights_by_attacker, attacker_type, attacker_potential):
    if not isinstance(weights_by_attacker, dict):
        return None
    attacker_key = f"{attacker_type}:{attacker_potential}"
    if attacker_key in weights_by_attacker:
        return float(weights_by_attacker[attacker_key])
    if "default" in weights_by_attacker:
        return float(weights_by_attacker["default"])
    return None


def resolve_maturity_weight(group_name, config):
    if not isinstance(config, dict):
        return None
    weights = config.get("weights", {})
    aliases = config.get("aliases", {})
    if not isinstance(weights, dict) or not weights:
        return None
    target_key = _normalize_key(group_name or "")
    for name, weight_value in weights.items():
        if _normalize_key(name) == target_key:
            return float(weight_value)
    if isinstance(aliases, dict):
        for name, alias_list in aliases.items():
            if not isinstance(alias_list, list):
                continue
            for alias in alias_list:
                if _normalize_key(alias) == target_key:
                    if name in weights:
                        return float(weights[name])
    return None


def get_weighted_criteria_score(criteria, group_scores, config, attacker_type, attacker_potential):
    if not criteria:
        return None
    total_value = 0.0
    group_count = 0
    for name, criteria_value in criteria.items():
        weight = _resolve_weight(criteria_value, attacker_type, attacker_potential)
        if weight is None:
            weight = 1.0
        resolved = resolve_criteria_group(name, group_scores, config)
        if not resolved:
            continue
        total_value += group_scores[resolved] * float(weight)
        group_count += 1
    if group_count <= 0:
        return None
    return total_value / group_count


def calculate_risk_assessment(
    layers,
    technical_groups,
    organizational_groups,
    attacker_type,
    attacker_potential,
    layer_map,
    maturity_weights=None,
    use_monte_carlo=False,
    sis_is_integrated=True,
    event_names=None,
    event_losses=None,
):
    group_scores, errors = compute_group_scores(technical_groups)
    if errors:
        return {"errors": errors}

    combined_scores = dict(group_scores)
    if organizational_groups:
        org_scores, org_errors = compute_group_scores(organizational_groups)
        if org_errors:
            return {"errors": org_errors}
        for name, value in org_scores.items():
            if name in combined_scores:
                combined_scores[name] = (combined_scores[name] + value) / 2
            else:
                combined_scores[name] = value

    maturity_weight_map = {}
    for name in combined_scores.keys():
        weight_value = resolve_maturity_weight(name, maturity_weights or {})
        maturity_weight_map[name] = weight_value if weight_value is not None else 1.0
    maturity = weighted_average(combined_scores, maturity_weight_map)
    if maturity is None:
        maturity = 0.0

    base_settings = layer_map.get("base_settings", {})
    min_pfd = float(base_settings.get("min_pfd", 0.0))
    max_pfd = float(base_settings.get("max_pfd", 1.0))
    gamma = float(base_settings.get("gamma", 1.0))
    attacker_multipliers = base_settings.get("attacker_multiplier", {})
    attacker_multiplier = float(attacker_multipliers.get(attacker_potential, 1.0))
    if attacker_multiplier <= 0:
        attacker_multiplier = 1.0
    org_multiplier = calculate_organizational_multiplier(organizational_groups)

    def clamp_pfd(value):
        return max(min(value, max_pfd), min_pfd)

    def apply_pfd_model(pfd_base, criteria_score):
        criteria_score = max(min(criteria_score, 1.0), 0.0)
        cdf = criteria_score / attacker_multiplier
        cdf = max(min(cdf, 1.0), 0.0)
        cdf_safe = max(cdf, 0.01)
        effective = math.pow(pfd_base, math.pow(cdf_safe, gamma))
        return clamp_pfd(effective), cdf

    baseline_breach = 1.0
    cyber_breach = 1.0
    result_layers = []

    for layer in layers:
        base_pfd = float(layer.get("pfd", 1.0))
        layer_config = resolve_layer_config(layer.get("name", ""), layer_map)
        criteria = None
        fixed_pfd = False
        layer_weight = None
        if layer_config:
            if "fixed_pfd" in layer_config:
                base_pfd = float(layer_config["fixed_pfd"])
                fixed_pfd = True
                layer_weight = _resolve_attacker_weight(
                    layer_config.get("weights_by_attacker", {}), attacker_type, attacker_potential
                )
            if "scenario_switch" in layer_config:
                switch = layer_config.get("scenario_switch", {})
                flag_value = "true" if sis_is_integrated else "false"
                criteria = switch.get("values", {}).get(flag_value, {}).get("criteria")
            else:
                criteria = layer_config.get("criteria")
        is_corporate = fixed_pfd and _is_corporate_layer(layer_config, layer.get("name", ""))
        if is_corporate:
            base_pfd = clamp_pfd(base_pfd)
            criteria_score = layer_weight if layer_weight is not None else 1.0
            effective_pfd, degradation = apply_pfd_model(base_pfd, criteria_score)
            effective_pfd_year2 = clamp_pfd(effective_pfd * org_multiplier)
            effective_pfd_year3 = clamp_pfd(effective_pfd_year2 * org_multiplier)
            baseline_breach *= base_pfd
            cyber_breach *= effective_pfd
            result_layers.append(
                {
                    "name": layer.get("name"),
                    "base_pfd": base_pfd,
                    "effective_pfd": effective_pfd,
                    "effective_pfd_year2": effective_pfd_year2,
                    "effective_pfd_year3": effective_pfd_year3,
                    "degradation_factor": degradation,
                    "attacker_degradation": degradation,
                    "org_multiplier": org_multiplier if layer.get("cyber", True) and not fixed_pfd else 1.0,
                    "cyber_sensitive": bool(layer.get("cyber", True)),
                }
            )
            continue

        if layer_weight is not None:
            base_pfd = base_pfd * layer_weight
        base_pfd = clamp_pfd(base_pfd)
        baseline_breach *= base_pfd
        if fixed_pfd:
            degradation = 1.0
            effective_pfd = base_pfd
            effective_pfd_year2 = effective_pfd
            effective_pfd_year3 = effective_pfd
        elif layer.get("cyber", True):
            group_factor = get_weighted_criteria_score(
                criteria, group_scores, layer_map, attacker_type, attacker_potential
            )
            if (
                layer_config
                and "scenario_switch" in layer_config
                and not sis_is_integrated
                and attacker_type == "external"
            ):
                group_factor = 1.0
            if group_factor is None:
                if group_scores:
                    group_factor = sum(group_scores.values()) / len(group_scores.values())
                else:
                    group_factor = 1.0
            effective_pfd, degradation = apply_pfd_model(base_pfd, group_factor)
            effective_pfd_year2 = clamp_pfd(effective_pfd * org_multiplier)
            effective_pfd_year3 = clamp_pfd(effective_pfd_year2 * org_multiplier)
        else:
            degradation = 1.0
            effective_pfd = base_pfd
            effective_pfd_year2 = effective_pfd
            effective_pfd_year3 = effective_pfd

        cyber_breach *= effective_pfd
        result_layers.append(
            {
                "name": layer.get("name"),
                "base_pfd": base_pfd,
                "effective_pfd": effective_pfd,
                "effective_pfd_year2": effective_pfd_year2,
                "effective_pfd_year3": effective_pfd_year3,
                "degradation_factor": degradation,
                "attacker_degradation": degradation,
                "org_multiplier": org_multiplier if layer.get("cyber", True) and not fixed_pfd else 1.0,
                "cyber_sensitive": bool(layer.get("cyber", True)),
            }
        )

    def build_event_table(effective_key):
        cumulative = 1.0
        rows = []
        for idx, layer in enumerate(result_layers):
            pfd = float(layer.get(effective_key, 0))
            event_prob = cumulative * (1 - pfd)
            rows.append(event_prob)
            cumulative *= pfd
        rows.append(cumulative)
        return rows

    probs_year1 = build_event_table("effective_pfd")
    probs_year2 = build_event_table("effective_pfd_year2")
    probs_year3 = build_event_table("effective_pfd_year3")

    event_count = len(result_layers) + 1
    names = event_names if isinstance(event_names, list) else []
    losses = event_losses if isinstance(event_losses, list) else []

    event_table = []
    for idx in range(event_count):
        name = names[idx] if idx < len(names) and names[idx] else f"Event {idx + 1}"
        loss_entry = losses[idx] if idx < len(losses) and isinstance(losses[idx], dict) else {}
        sle = loss_entry.get("sle")
        currency = loss_entry.get("currency")
        comment = loss_entry.get("comment")
        sle_value = None
        try:
            if sle is not None and sle != "":
                sle_value = float(str(sle).replace(",", "."))
        except ValueError:
            sle_value = None
        loss_year1 = sle_value * probs_year1[idx] if sle_value is not None else None
        loss_year2 = sle_value * probs_year2[idx] if sle_value is not None else None
        loss_year3 = sle_value * probs_year3[idx] if sle_value is not None else None
        event_table.append(
            {
                "name": name,
                "probability_year1": probs_year1[idx],
                "probability_year2": probs_year2[idx],
                "probability_year3": probs_year3[idx],
                "sle": sle_value,
                "currency": currency,
                "comment": comment,
                "loss_year1": loss_year1,
                "loss_year2": loss_year2,
                "loss_year3": loss_year3,
            }
        )

    return {
        "baseline_breach_probability": baseline_breach,
        "cyber_breach_probability": cyber_breach,
        "maturity_score": round(maturity * 100, 1),
        "layers": result_layers,
        "event_losses": event_table,
        "use_monte_carlo": use_monte_carlo,
    }
