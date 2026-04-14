"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

import logging

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import pandas as pd
import json
import csv
import io
import os
import tempfile
from risk_engine import calculate_risk, calculate_risk_assessment
from lopa_engine import build_lopa_tree, collapse_consequences, export_lopa
from recommendations import build_recommendations_payload, fetch_recommendations, load_recommendations_config
from reporting.report_builder import generate_report

logger = logging.getLogger(__name__)

class LopaLayer(BaseModel):
    name: str
    pfd: float


class LopaRequest(BaseModel):
    layers: list[LopaLayer]
    export: bool = True


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_UPLOAD_ROWS = 300


def _parse_cors_origins(value: str | None) -> list[str]:
    if not value:
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    origins = [item.strip() for item in value.split(",") if item.strip()]
    return origins or ["http://localhost:3000", "http://127.0.0.1:3000"]


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(os.getenv("BACKEND_CORS_ORIGINS")),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _normalize_header(value: str) -> str:
    return value.strip().lower().replace("_", " ")


def _parse_float(value: str, field: str, row_idx: int, errors: list, allow_empty: bool = False):
    text = (value or "").strip()
    if text == "":
        if allow_empty:
            return None
        errors.append({"row": row_idx, "field": field, "error": "empty"})
        return None
    try:
        return float(text.replace(",", "."))
    except ValueError:
        errors.append({"row": row_idx, "field": field, "error": "not_numeric", "value": text})
        return None


def _validate_csv_upload(file: UploadFile, field: str):
    filename = (file.filename or "").lower()
    if not filename or not filename.endswith(".csv"):
        raise HTTPException(status_code=422, detail=f"invalid_{field}_file_type")


def _validate_upload_size(file: UploadFile, field: str, limit_bytes: int = MAX_UPLOAD_BYTES):
    try:
        position = file.file.tell()
        file.file.seek(0, os.SEEK_END)
        size = file.file.tell()
        file.file.seek(position, os.SEEK_SET)
        if size > limit_bytes:
            raise HTTPException(status_code=413, detail=f"{field}_file_too_large")
    except HTTPException:
        raise
    except Exception:
        # If size cannot be determined, allow processing to continue.
        return


def _validate_row_limit(row_count: int, field: str, limit_rows: int = MAX_UPLOAD_ROWS):
    if row_count > limit_rows:
        raise HTTPException(status_code=422, detail=f"{field}_too_many_rows")


def _parse_bool_flag(value: str, field: str) -> bool:
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise HTTPException(status_code=422, detail=f"invalid_{field}")


def _parse_layers_json(layers: str, include_cyber: bool = True):
    try:
        layers_data = json.loads(layers)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="invalid_layers_json")
    if not isinstance(layers_data, list) or not layers_data:
        raise HTTPException(status_code=422, detail="invalid_layers_list")

    validated_layers = []
    for idx, layer in enumerate(layers_data, start=1):
        if not isinstance(layer, dict):
            raise HTTPException(status_code=422, detail=f"invalid_layer_{idx}")
        name = str(layer.get("name", "")).strip()
        if not name:
            raise HTTPException(status_code=422, detail=f"invalid_layer_name_{idx}")
        try:
            pfd = float(layer.get("pfd", 1))
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail=f"invalid_layer_pfd_{idx}")
        if pfd < 0 or pfd > 1:
            raise HTTPException(status_code=422, detail=f"invalid_layer_pfd_range_{idx}")
        payload = {"name": name, "pfd": pfd}
        if include_cyber:
            cyber_value = layer.get("cyber", True)
            if isinstance(cyber_value, bool):
                payload["cyber"] = cyber_value
            elif isinstance(cyber_value, str):
                normalized = cyber_value.strip().lower()
                if normalized in {"true", "1", "yes"}:
                    payload["cyber"] = True
                elif normalized in {"false", "0", "no"}:
                    payload["cyber"] = False
                else:
                    raise HTTPException(status_code=422, detail=f"invalid_layer_cyber_{idx}")
            else:
                raise HTTPException(status_code=422, detail=f"invalid_layer_cyber_{idx}")
        validated_layers.append(payload)

    return validated_layers


def _load_json_config(path: str, default):
    try:
        with open(path, "r", encoding="utf-8") as file_handle:
            return json.load(file_handle)
    except FileNotFoundError:
        return default


def parse_questionnaire_csv(file: UploadFile):
    _validate_csv_upload(file, "questionnaire")
    _validate_upload_size(file, "questionnaire")
    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="replace")

    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="empty_file")

    header_row = rows[0]
    header_map = {}
    known = {
        "group": "group",
        "group name": "group_name",
        "group weight": "group_weight",
        "question id": "question_id",
        "question": "question",
        "score": "score",
        "max score": "max_score",
        "scoring guidance": "scoring_guidance",
        "evidence": "evidence",
    }
    for idx, value in enumerate(header_row):
        key = known.get(_normalize_header(value))
        if key:
            header_map[key] = idx

    has_header = {"group", "group_name", "question_id", "question"}.issubset(header_map.keys())
    has_group_weight = "group_weight" in header_map
    start_idx = 1 if has_header else 0
    non_empty_rows = sum(1 for row in rows[start_idx:] if any(cell.strip() for cell in row))
    _validate_row_limit(non_empty_rows, "questionnaire")

    def cell(row, key, fallback_index):
        if key in header_map:
            idx = header_map[key]
        else:
            idx = fallback_index
        return row[idx] if idx < len(row) else ""

    groups = {}
    errors = []
    question_count = 0

    for row_idx, row in enumerate(rows[start_idx:], start=start_idx + 1):
        if not any(cell.strip() for cell in row):
            continue
        group_id = cell(row, "group", 0).strip()
        group_name = cell(row, "group_name", 1).strip()
        group_weight = cell(row, "group_weight", 2).strip() if has_group_weight else ""
        question_id = cell(row, "question_id", 3).strip()
        question_text = cell(row, "question", 4).strip()
        score_text = cell(row, "score", 5).strip()
        max_score_text = cell(row, "max_score", 6).strip()
        guidance = cell(row, "scoring_guidance", 7).strip()
        evidence = cell(row, "evidence", 8).strip()

        if not group_id:
            errors.append({"row": row_idx, "field": "group", "error": "empty"})
            continue
        if not group_name:
            errors.append({"row": row_idx, "field": "group_name", "error": "empty"})
            continue
        if not question_id:
            errors.append({"row": row_idx, "field": "question_id", "error": "empty"})
            continue
        if not question_text:
            errors.append({"row": row_idx, "field": "question", "error": "empty"})
            continue

        weight_value = _parse_float(group_weight or "1", "group_weight", row_idx, errors)
        max_score_value = _parse_float(max_score_text, "max_score", row_idx, errors)
        score_value = _parse_float(score_text, "score", row_idx, errors, allow_empty=True)

        if weight_value is not None and weight_value <= 0:
            errors.append({"row": row_idx, "field": "group_weight", "error": "non_positive"})
        if max_score_value is not None and max_score_value < 0:
            errors.append({"row": row_idx, "field": "max_score", "error": "negative"})
        if score_value is not None and max_score_value is not None and score_value > max_score_value:
            errors.append({"row": row_idx, "field": "score", "error": "exceeds_max"})

        group_key = f"{group_id}:{group_name}"
        group = groups.get(group_key)
        if not group:
            group = {
                "group_id": group_id,
                "group_name": group_name,
                "weight": weight_value if weight_value is not None else 1.0,
                "questions": [],
            }
            groups[group_key] = group

        group["questions"].append(
            {
                "id": question_id,
                "text": question_text,
                "score": score_value,
                "max_score": max_score_value,
                "scoring_guidance": guidance,
                "evidence": evidence,
            }
        )
        question_count += 1

    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors, "question_count": question_count})

    return {
        "groups": list(groups.values()),
        "question_count": question_count,
    }


def _parse_event_names(event_names: str):
    parsed_event_names = []
    if event_names:
        try:
            parsed_event_names = json.loads(event_names)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="invalid_event_names")
        if not isinstance(parsed_event_names, list):
            raise HTTPException(status_code=422, detail="invalid_event_names")
        for idx, name in enumerate(parsed_event_names):
            if name is None or name == "":
                continue
            if not isinstance(name, str):
                raise HTTPException(status_code=422, detail=f"invalid_event_name_{idx}")
    return parsed_event_names


def _parse_event_losses(event_losses: str):
    parsed_event_losses = []
    if event_losses:
        try:
            parsed_event_losses = json.loads(event_losses)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="invalid_event_losses")
        if not isinstance(parsed_event_losses, list):
            raise HTTPException(status_code=422, detail="invalid_event_losses")
        for idx, entry in enumerate(parsed_event_losses):
            if not isinstance(entry, dict):
                raise HTTPException(status_code=422, detail=f"invalid_event_loss_{idx}")
            sle_value = entry.get("sle")
            if sle_value not in (None, ""):
                try:
                    parsed_sle = float(str(sle_value).replace(",", "."))
                except ValueError:
                    raise HTTPException(status_code=422, detail=f"invalid_event_loss_sle_{idx}")
                if parsed_sle < 0:
                    raise HTTPException(status_code=422, detail=f"negative_event_loss_sle_{idx}")
            currency_value = entry.get("currency")
            if currency_value not in (None, "") and not isinstance(currency_value, str):
                raise HTTPException(status_code=422, detail=f"invalid_event_loss_currency_{idx}")
            comment_value = entry.get("comment")
            if comment_value not in (None, "") and not isinstance(comment_value, str):
                raise HTTPException(status_code=422, detail=f"invalid_event_loss_comment_{idx}")
    return parsed_event_losses


def validate_layer_config(config):
    errors = []
    if not isinstance(config, dict):
        errors.append("config_not_object")
        return errors
    base_settings = config.get("base_settings", {})
    if base_settings:
        if not isinstance(base_settings, dict):
            errors.append("base_settings_not_object")
        else:
            min_pfd = base_settings.get("min_pfd")
            max_pfd = base_settings.get("max_pfd")
            gamma = base_settings.get("gamma")
            if not isinstance(min_pfd, (int, float)):
                errors.append("min_pfd_invalid")
            if not isinstance(max_pfd, (int, float)):
                errors.append("max_pfd_invalid")
            if isinstance(min_pfd, (int, float)) and isinstance(max_pfd, (int, float)) and min_pfd > max_pfd:
                errors.append("min_pfd_gt_max_pfd")
            if gamma is not None and not isinstance(gamma, (int, float)):
                errors.append("gamma_invalid")
            attacker_multiplier = base_settings.get("attacker_multiplier", {})
            if attacker_multiplier and not isinstance(attacker_multiplier, dict):
                errors.append("attacker_multiplier_not_object")
            else:
                for key in ("low", "medium", "high"):
                    if key in attacker_multiplier and not isinstance(attacker_multiplier[key], (int, float)):
                        errors.append(f"attacker_multiplier_{key}_invalid")
                    if key in attacker_multiplier and isinstance(attacker_multiplier[key], (int, float)) and attacker_multiplier[key] <= 0:
                        errors.append(f"attacker_multiplier_{key}_non_positive")
    layers = config.get("layers", {})
    if layers and not isinstance(layers, dict):
        errors.append("layers_not_object")
        return errors
    for layer_name, layer_cfg in (layers or {}).items():
        if not isinstance(layer_cfg, dict):
            errors.append(f"layer_{layer_name}_not_object")
            continue
        fixed_pfd = layer_cfg.get("fixed_pfd")
        if fixed_pfd is not None and not isinstance(fixed_pfd, (int, float)):
            errors.append(f"layer_{layer_name}_fixed_pfd_invalid")
        aliases = layer_cfg.get("aliases")
        if aliases is not None and not (
            isinstance(aliases, list) and all(isinstance(item, str) for item in aliases)
        ):
            errors.append(f"layer_{layer_name}_aliases_invalid")
        is_corporate = layer_cfg.get("is_corporate")
        if is_corporate is not None and not isinstance(is_corporate, bool):
            errors.append(f"layer_{layer_name}_is_corporate_invalid")
        layer_weights = layer_cfg.get("weights_by_attacker")
        if layer_weights is not None and not isinstance(layer_weights, dict):
            errors.append(f"layer_{layer_name}_weights_by_attacker_invalid")
        criteria = layer_cfg.get("criteria")
        if criteria is not None and not isinstance(criteria, dict):
            errors.append(f"layer_{layer_name}_criteria_invalid")
        if isinstance(criteria, dict):
            for crit_name, crit_value in criteria.items():
                if isinstance(crit_value, (int, float)):
                    continue
                if isinstance(crit_value, dict):
                    if "default" in crit_value and not isinstance(crit_value["default"], (int, float)):
                        errors.append(f"layer_{layer_name}_criteria_{crit_name}_default_invalid")
                    weights_by_attacker = crit_value.get("weights_by_attacker", {})
                    if weights_by_attacker and not isinstance(weights_by_attacker, dict):
                        errors.append(f"layer_{layer_name}_criteria_{crit_name}_weights_by_attacker_invalid")
                    elif isinstance(weights_by_attacker, dict):
                        for weight_key, weight_value in weights_by_attacker.items():
                            if not isinstance(weight_value, (int, float)):
                                errors.append(f"layer_{layer_name}_criteria_{crit_name}_weight_{weight_key}_invalid")
                    continue
                errors.append(f"layer_{layer_name}_criteria_{crit_name}_invalid")
        scenario_switch = layer_cfg.get("scenario_switch")
        if scenario_switch is not None:
            if not isinstance(scenario_switch, dict):
                errors.append(f"layer_{layer_name}_scenario_switch_invalid")
                continue
            values = scenario_switch.get("values", {})
            if not isinstance(values, dict):
                errors.append(f"layer_{layer_name}_scenario_values_invalid")
            else:
                for flag_key, flag_value in values.items():
                    if not isinstance(flag_value, dict):
                        errors.append(f"layer_{layer_name}_scenario_{flag_key}_invalid")
                        continue
                    flag_criteria = flag_value.get("criteria")
                    if flag_criteria is not None and not isinstance(flag_criteria, dict):
                        errors.append(f"layer_{layer_name}_scenario_{flag_key}_criteria_invalid")
    return errors


def validate_maturity_weights(config):
    errors = []
    if not isinstance(config, dict):
        return ["maturity_config_not_object"]
    weights = config.get("weights", {})
    aliases = config.get("aliases", {})
    if weights and not isinstance(weights, dict):
        errors.append("maturity_weights_not_object")
    if isinstance(weights, dict):
        for name, value in weights.items():
            if not isinstance(value, (int, float)):
                errors.append(f"maturity_weight_{name}_invalid")
    if aliases and not isinstance(aliases, dict):
        errors.append("maturity_aliases_not_object")
    if isinstance(aliases, dict):
        for name, alias_list in aliases.items():
            if not isinstance(alias_list, list) or not all(isinstance(item, str) for item in alias_list):
                errors.append(f"maturity_aliases_{name}_invalid")
    return errors


@app.post("/api/v1/submit_model")
async def submit_model(
    file: UploadFile = File(...),
    layers: str = Form(...),
    attacker_type: str = Form(...),
    attacker_potential: str = Form(...),
    use_monte_carlo: str = Form("false"),
    sis_is_integrated: str = Form("true"),
    event_names: str = Form(""),
    event_losses: str = Form(""),
):
    try:
        filename = (file.filename or "").lower()
        if not (filename.endswith(".xlsx") or filename.endswith(".csv")):
            raise HTTPException(status_code=422, detail="invalid_file_type")
        _validate_upload_size(file, "model")

        if filename.endswith(".csv"):
            raw = file.file.read()
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = raw.decode("utf-8", errors="replace")
            lines = [line for line in text.splitlines() if line.strip()]
            header_line = lines[0] if lines else ""
            delimiter = ";"
            try:
                dialect = csv.Sniffer().sniff(text[:4096], delimiters=";,\t")
                delimiter = dialect.delimiter
            except csv.Error:
                delimiter = ";"
            semicolons = header_line.count(";")
            commas = header_line.count(",")
            tabs = header_line.count("\t")
            if semicolons >= commas and semicolons >= tabs:
                delimiter = ";"
            elif commas >= tabs:
                delimiter = ","
            else:
                delimiter = "\t"
            df = pd.read_csv(io.StringIO(text), sep=delimiter, engine="python")
            _validate_row_limit(len(df.index), "model")
            excel_data = {"sheet1": df}
        else:
            excel_data = pd.read_excel(file.file, sheet_name=None)
            for sheet_name, df in excel_data.items():
                _validate_row_limit(len(df.index), f"model_{sheet_name}")

        validated_layers = _parse_layers_json(layers, include_cyber=True)

        allowed_types = {"internal", "external"}
        allowed_potential = {"low", "medium", "high"}
        if attacker_type not in allowed_types:
            raise HTTPException(status_code=422, detail="invalid_attacker_type")
        if attacker_potential not in allowed_potential:
            raise HTTPException(status_code=422, detail="invalid_attacker_potential")

        use_monte_carlo_value = _parse_bool_flag(use_monte_carlo, "use_monte_carlo")

        result = calculate_risk(
            excel_data,
            validated_layers,
            attacker_type=attacker_type,
            attacker_potential=attacker_potential,
            use_monte_carlo=use_monte_carlo_value,
        )
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("submit_model_failed")
        raise HTTPException(status_code=500, detail="internal_server_error")


@app.post("/api/v1/questionnaire/parse")
async def parse_questionnaire(file: UploadFile = File(...)):
    return parse_questionnaire_csv(file)


@app.post("/api/v1/risk_assessment")
async def risk_assessment(
    technical_questionnaire: UploadFile = File(...),
    organizational_questionnaire: UploadFile | None = File(None),
    layers: str = Form(...),
    attacker_type: str = Form(...),
    attacker_potential: str = Form(...),
    use_monte_carlo: str = Form("false"),
    sis_is_integrated: str = Form("true"),
    event_names: str = Form(""),
    event_losses: str = Form(""),
    max_loss_threshold: str = Form(""),
):
    allowed_types = {"internal", "external"}
    allowed_potential = {"low", "medium", "high"}
    if attacker_type not in allowed_types:
        raise HTTPException(status_code=422, detail="invalid_attacker_type")
    if attacker_potential not in allowed_potential:
        raise HTTPException(status_code=422, detail="invalid_attacker_potential")

    validated_layers = _parse_layers_json(layers, include_cyber=True)

    use_monte_carlo_value = _parse_bool_flag(use_monte_carlo, "use_monte_carlo")
    sis_integrated_value = _parse_bool_flag(sis_is_integrated, "sis_is_integrated")

    technical_data = parse_questionnaire_csv(technical_questionnaire)
    organizational_data = None
    if organizational_questionnaire is not None:
        organizational_data = parse_questionnaire_csv(organizational_questionnaire)

    parsed_event_names = _parse_event_names(event_names)
    parsed_event_losses = _parse_event_losses(event_losses)
    expected_events = len(validated_layers) + 1
    if parsed_event_names and len(parsed_event_names) != expected_events:
        raise HTTPException(status_code=422, detail="invalid_event_names_length")
    if parsed_event_losses and len(parsed_event_losses) != expected_events:
        raise HTTPException(status_code=422, detail="invalid_event_losses_length")

    max_loss_value = None
    if max_loss_threshold not in (None, ""):
        try:
            max_loss_value = float(str(max_loss_threshold).replace(",", "."))
        except ValueError:
            raise HTTPException(status_code=422, detail="invalid_max_loss_threshold")
        if max_loss_value < 0:
            raise HTTPException(status_code=422, detail="negative_max_loss_threshold")

    config_dir = os.path.join(os.path.dirname(__file__), "config")
    mapping_path = os.path.join(config_dir, "layer_mappings.json")
    aliases_path = os.path.join(config_dir, "criteria_aliases.json")
    maturity_path = os.path.join(config_dir, "maturity_weights.json")
    layer_map = _load_json_config(mapping_path, {})
    layer_map["criteria_aliases"] = _load_json_config(aliases_path, {})
    maturity_weights = _load_json_config(maturity_path, {})
    config_errors = validate_layer_config(layer_map)
    if config_errors:
        raise HTTPException(status_code=500, detail={"config_errors": config_errors})
    maturity_errors = validate_maturity_weights(maturity_weights)
    if maturity_errors:
        raise HTTPException(status_code=500, detail={"config_errors": maturity_errors})

    result = calculate_risk_assessment(
        validated_layers,
        technical_data.get("groups", []),
        organizational_data.get("groups", []) if organizational_data else [],
        attacker_type,
        attacker_potential,
        layer_map,
        maturity_weights=maturity_weights,
        use_monte_carlo=use_monte_carlo_value,
        sis_is_integrated=sis_integrated_value,
        event_names=parsed_event_names,
        event_losses=parsed_event_losses,
    )
    if result.get("errors"):
        raise HTTPException(status_code=422, detail=result["errors"])
    if max_loss_value is not None:
        result["max_loss_threshold"] = max_loss_value
    return result


@app.get("/api/v1/recommendations/config")
async def recommendations_config():
    config_dir = os.path.join(os.path.dirname(__file__), "config")
    rec_path = os.path.join(config_dir, "recommendations.json")
    config = load_recommendations_config(rec_path)
    return {
        "model": config.get("model", ""),
        "user_prompt": config.get("user_prompt", ""),
    }


@app.post("/api/v1/recommendations")
async def recommendations(
    technical_questionnaire: UploadFile = File(...),
    organizational_questionnaire: UploadFile | None = File(None),
    layers: str = Form(...),
    attacker_type: str = Form(...),
    attacker_potential: str = Form(...),
    sis_is_integrated: str = Form("true"),
    user_prompt: str = Form(""),
):
    allowed_types = {"internal", "external"}
    allowed_potential = {"low", "medium", "high"}
    if attacker_type not in allowed_types:
        raise HTTPException(status_code=422, detail="invalid_attacker_type")
    if attacker_potential not in allowed_potential:
        raise HTTPException(status_code=422, detail="invalid_attacker_potential")

    validated_layers = _parse_layers_json(layers, include_cyber=False)

    sis_integrated_value = _parse_bool_flag(sis_is_integrated, "sis_is_integrated")

    technical_data = parse_questionnaire_csv(technical_questionnaire)
    organizational_data = None
    if organizational_questionnaire is not None:
        organizational_data = parse_questionnaire_csv(organizational_questionnaire)

    config_dir = os.path.join(os.path.dirname(__file__), "config")
    mapping_path = os.path.join(config_dir, "layer_mappings.json")
    aliases_path = os.path.join(config_dir, "criteria_aliases.json")
    rec_path = os.path.join(config_dir, "recommendations.json")
    maturity_path = os.path.join(config_dir, "maturity_weights.json")
    layer_map = _load_json_config(mapping_path, {})
    layer_map["criteria_aliases"] = _load_json_config(aliases_path, {})
    maturity_weights = _load_json_config(maturity_path, {})

    config_errors = validate_layer_config(layer_map)
    if config_errors:
        raise HTTPException(status_code=500, detail={"config_errors": config_errors})
    maturity_errors = validate_maturity_weights(maturity_weights)
    if maturity_errors:
        raise HTTPException(status_code=500, detail={"config_errors": maturity_errors})

    payload = build_recommendations_payload(
        validated_layers,
        technical_data.get("groups", []),
        organizational_data.get("groups", []) if organizational_data else [],
        layer_map,
        attacker_type,
        attacker_potential,
        maturity_weights=maturity_weights,
        sis_is_integrated=sis_integrated_value,
    )
    rec_config = load_recommendations_config(rec_path)
    try:
        result = fetch_recommendations(payload, rec_config, user_prompt=user_prompt)
    except ValueError:
        logger.exception("recommendations_failed")
        raise HTTPException(status_code=500, detail="recommendations_unavailable")
    return {
        "recommendations": result.get("content", ""),
        "raw": result.get("raw"),
        "payload": payload,
    }


@app.post("/api/v1/report")
async def build_report(
    technical_questionnaire: UploadFile = File(...),
    organizational_questionnaire: UploadFile | None = File(None),
    layers: str = Form(...),
    attacker_type: str = Form(...),
    attacker_potential: str = Form(...),
    use_monte_carlo: str = Form("false"),
    sis_is_integrated: str = Form("true"),
    event_names: str = Form(""),
    event_losses: str = Form(""),
    recommendations: str = Form(""),
    report_format: str = Form("pdf"),
):
    allowed_types = {"internal", "external"}
    allowed_potential = {"low", "medium", "high"}
    if attacker_type not in allowed_types:
        raise HTTPException(status_code=422, detail="invalid_attacker_type")
    if attacker_potential not in allowed_potential:
        raise HTTPException(status_code=422, detail="invalid_attacker_potential")

    validated_layers = _parse_layers_json(layers, include_cyber=True)
    use_monte_carlo_value = _parse_bool_flag(use_monte_carlo, "use_monte_carlo")
    sis_integrated_value = _parse_bool_flag(sis_is_integrated, "sis_is_integrated")
    report_format_value = str(report_format).strip().lower()
    if report_format_value not in {"pdf", "docx"}:
        raise HTTPException(status_code=422, detail="invalid_report_format")

    technical_data = parse_questionnaire_csv(technical_questionnaire)
    organizational_data = None
    if organizational_questionnaire is not None:
        organizational_data = parse_questionnaire_csv(organizational_questionnaire)

    parsed_event_names = _parse_event_names(event_names)
    parsed_event_losses = _parse_event_losses(event_losses)
    expected_events = len(validated_layers) + 1
    if parsed_event_names and len(parsed_event_names) != expected_events:
        raise HTTPException(status_code=422, detail="invalid_event_names_length")
    if parsed_event_losses and len(parsed_event_losses) != expected_events:
        raise HTTPException(status_code=422, detail="invalid_event_losses_length")

    config_dir = os.path.join(os.path.dirname(__file__), "config")
    mapping_path = os.path.join(config_dir, "layer_mappings.json")
    aliases_path = os.path.join(config_dir, "criteria_aliases.json")
    maturity_path = os.path.join(config_dir, "maturity_weights.json")
    layer_map = _load_json_config(mapping_path, {})
    layer_map["criteria_aliases"] = _load_json_config(aliases_path, {})
    maturity_weights = _load_json_config(maturity_path, {})
    config_errors = validate_layer_config(layer_map)
    if config_errors:
        raise HTTPException(status_code=500, detail={"config_errors": config_errors})
    maturity_errors = validate_maturity_weights(maturity_weights)
    if maturity_errors:
        raise HTTPException(status_code=500, detail={"config_errors": maturity_errors})

    risk_result = calculate_risk_assessment(
        validated_layers,
        technical_data.get("groups", []),
        organizational_data.get("groups", []) if organizational_data else [],
        attacker_type,
        attacker_potential,
        layer_map,
        maturity_weights=maturity_weights,
        use_monte_carlo=use_monte_carlo_value,
        sis_is_integrated=sis_integrated_value,
        event_names=parsed_event_names,
        event_losses=parsed_event_losses,
    )
    if risk_result.get("errors"):
        raise HTTPException(status_code=422, detail=risk_result["errors"])

    report_path = generate_report(
        report_format=report_format_value,
        technical_groups=technical_data.get("groups", []),
        organizational_groups=organizational_data.get("groups", []) if organizational_data else [],
        layers_input=validated_layers,
        risk_result=risk_result,
        attacker_type=attacker_type,
        attacker_potential=attacker_potential,
        recommendations_text=recommendations,
    )
    if report_format_value == "docx":
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename = "risk_report.docx"
    else:
        media_type = "application/pdf"
        filename = "risk_report.pdf"
    return FileResponse(report_path, media_type=media_type, filename=filename)


@app.post("/api/v1/lopa")
async def build_lopa(request: LopaRequest):
    try:
        layers = [layer.model_dump() for layer in request.layers]
        tree = build_lopa_tree(layers)
        collapsed = collapse_consequences(tree)
        breach_probability = next(
            (item["probability"] for item in collapsed if item["outcome"] == "Breach"), 0.0
        )
        export_paths = None
        if request.export:
            export_dir = tempfile.mkdtemp(prefix="lopa_export_")
            export_paths = export_lopa(layers, export_dir)
        return {
            "branches": tree["branches"],
            "collapsed": collapsed,
            "breach_probability": breach_probability,
            "export": export_paths,
        }
    except Exception:
        logger.exception("build_lopa_failed")
        raise HTTPException(status_code=500, detail="internal_server_error")
