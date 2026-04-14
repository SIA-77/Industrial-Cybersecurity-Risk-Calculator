"""SPDX-FileCopyrightText: Ian Suhih
SPDX-License-Identifier: GPL-3.0-or-later
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Dict, List, Tuple

from graphviz import Digraph


@dataclass(frozen=True)
class LopaBranch:
    path: List[str]
    probability: float
    outcome: str


def build_lopa_tree(layers: List[Dict]) -> Dict[str, List[Dict]]:
    branches: List[LopaBranch] = []

    def walk(index: int, prob: float, path: List[str]) -> None:
        if index >= len(layers):
            branches.append(LopaBranch(path=path, probability=prob, outcome="Breach"))
            return
        layer = layers[index]
        name = layer.get("name", f"Layer {index + 1}")
        pfd = float(layer.get("pfd", 1.0))
        success_prob = prob * (1.0 - pfd)
        branches.append(LopaBranch(path=path + [name], probability=success_prob, outcome="Blocked"))
        fail_prob = prob * pfd
        walk(index + 1, fail_prob, path + [name])

    walk(0, 1.0, [])
    return {"branches": [branch.__dict__ for branch in branches]}


def collapse_consequences(tree: Dict) -> List[Dict]:
    branches = tree.get("branches", tree)
    totals: Dict[str, float] = {}
    for branch in branches:
        outcome = branch["outcome"]
        totals[outcome] = totals.get(outcome, 0.0) + float(branch["probability"])
    return [{"outcome": outcome, "probability": round(prob, 10)} for outcome, prob in totals.items()]


def draw_lopa_graph(layers: List[Dict], output_path: str | None = None) -> Tuple[str, str | None]:
    graph = Digraph("LOPA", format="png")
    graph.attr(rankdir="LR", bgcolor="white")

    graph.node("start", "Start", shape="circle", style="filled", fillcolor="#f8fafc", color="#94a3b8")
    breach_id = "breach"
    graph.node(breach_id, "Breach", shape="box", style="filled", fillcolor="#fee2e2", color="#ef4444")

    layer_ids = []
    for index, layer in enumerate(layers):
        node_id = f"layer_{index}"
        label = layer.get("name", f"Layer {index + 1}")
        graph.node(node_id, label, shape="box", style="rounded,filled", fillcolor="#ffffff", color="#94a3b8")
        layer_ids.append(node_id)

    if layer_ids:
        graph.edge("start", layer_ids[0], label="start", color="#64748b")

    for index, layer in enumerate(layers):
        node_id = layer_ids[index]
        pfd = float(layer.get("pfd", 1.0))
        success_prob = max(0.0, 1.0 - pfd)
        blocked_id = f"blocked_{index}"
        graph.node(blocked_id, "Blocked", shape="box", style="filled", fillcolor="#dcfce7", color="#22c55e")
        graph.edge(node_id, blocked_id, label=f"{success_prob:.4f}", color="#16a34a")

        if index < len(layers) - 1:
            graph.edge(node_id, layer_ids[index + 1], label=f"{pfd:.4f}", color="#f97316")
        else:
            graph.edge(node_id, breach_id, label=f"{pfd:.4f}", color="#ef4444")

    dot_source = graph.source
    png_path = None
    if output_path:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        try:
            graph.render(output_path, cleanup=True)
            png_path = f"{output_path}.png"
        except Exception:
            png_path = None
    return dot_source, png_path


def export_lopa(layers: List[Dict], output_dir: str) -> Dict[str, str | None]:
    tree = build_lopa_tree(layers)
    json_path = os.path.join(output_dir, "lopa_tree.json")
    os.makedirs(output_dir, exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as handle:
        json.dump(tree, handle, ensure_ascii=False, indent=2)
    dot_source, png_path = draw_lopa_graph(layers, os.path.join(output_dir, "lopa_tree"))
    dot_path = os.path.join(output_dir, "lopa_tree.dot")
    with open(dot_path, "w", encoding="utf-8") as handle:
        handle.write(dot_source)
    return {"json": json_path, "dot": dot_path, "png": png_path}
