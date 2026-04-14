# Overview

## Purpose

ICS Cybersecurity Risk Calculator is a quantitative cyber risk assessment tool for industrial control systems. Its goal is to answer a practical operational question:

How do cyberattacks change the real risk of industrial incidents when you consider protection layers and potential business loss?

Unlike maturity-only or checklist-only approaches, this project converts cybersecurity posture into measurable changes in scenario probability and expected loss.

## Core idea

The system combines four inputs:

1. Protection layers and their baseline probability of failure on demand (PFD)
2. Technical questionnaire results
3. Organizational questionnaire results
4. Attacker profile and loss assumptions

From these inputs, the backend estimates how cyber-exposed layers degrade under attack and recalculates resulting event probabilities and losses.

## What makes it different

- It is quantitative rather than purely qualitative
- It connects cyber posture to industrial safety and business impact
- It distinguishes cyber-exposed and cyber-independent barriers
- It supports attacker-driven scenario adjustment
- It produces exportable reports for engineering and management workflows

## Intended users

- ICS/OT cybersecurity teams
- Process safety and reliability engineers
- Asset owners and industrial operators
- Risk analysts preparing board- or management-level summaries

## Main capabilities in this repository

- Questionnaire parsing from CSV
- Quantitative risk calculation with event-loss estimation
- LOPA-style layer visualization
- Recommendations payload generation for LLM-assisted mitigation guidance
- PDF and DOCX report export

## Product framing

This documentation is adapted from the public product description on `icscyberrisk.com` and aligned to the implementation in this repository. The open-source version preserves the same core framing:

- cyber risk is evaluated in the context of industrial safety
- protection layers are treated as measurable barriers
- attacker capability influences degradation
- outputs are intended to support real decisions, not just produce maturity labels
