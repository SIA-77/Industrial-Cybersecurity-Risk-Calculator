# Methodology

## Summary

The methodology implemented in this repository is a quantitative ICS/OT cyber risk model derived from my PhD research and translated into a practical software implementation. It is built around:

- protection layers with baseline PFD values
- questionnaire-based security posture indicators
- attacker type and capability modifiers
- event-loss calculations for business impact assessment

## 1. Layers of protection

The model uses a LOPA-style structure:

1. An initiating cyber event
2. A sequence of protection layers
3. A final adverse outcome if all relevant layers fail

Typical layers include:

- corporate network access path (optional)
- ICS DMZ
- control system or DCS
- SIS
- process or mechanical safeguards
- operator actions

Each layer has a baseline `pfd` value. Lower values represent stronger reliability.

## 2. Cyber-exposed versus cyber-independent layers

Not all barriers are degraded by cyberattack.

- Cyber-exposed layers are marked with `cyber=true`
- Cyber-independent layers keep their baseline reliability
- Corporate network access is treated as a special case in the model configuration

This prevents unrealistic over-degradation of purely passive or mechanical safeguards.

## 3. Questionnaire-driven degradation

The backend maps questionnaire results to security criteria and then to layer degradation.

High-level flow:

1. Parse technical and organizational questionnaires
2. Normalize group scores from questionnaire answers
3. Resolve criteria aliases and weights from configuration
4. Compute a criteria score per cyber-exposed layer
5. Convert that criteria score into degraded effective PFD values

The implementation lives primarily in:

- [backend/api_main.py](../backend/api_main.py)
- [backend/risk_engine.py](../backend/risk_engine.py)
- [backend/config/layer_mappings.json](../backend/config/layer_mappings.json)
- [backend/config/criteria_aliases.json](../backend/config/criteria_aliases.json)
- [backend/config/maturity_weights.json](../backend/config/maturity_weights.json)

## 4. Attacker model

The model explicitly accounts for:

- attacker type: `internal` or `external`
- attacker capability: `low`, `medium`, or `high`

These parameters influence degradation factors and layer weighting, especially for attack paths that are more plausible for one attacker profile than another.

## 5. Organizational effect

Organizational questionnaire results are used to derive an additional multiplier that affects later-year degradation.

In the current implementation:

- year 1 uses the direct cyber-degraded effective PFD
- years 2 and 3 apply an organizational multiplier to reflect sustained weakness or operational drift

## 6. Event probabilities and losses

After effective PFD values are calculated, the model computes event probabilities across the sequence of protection layers.

The output includes:

- breach probability before cyber degradation
- breach probability after cyber degradation
- per-event probabilities for years 1, 2, and 3
- expected loss per event when SLE values are provided

This supports side-by-side comparison of:

- current versus acceptable loss levels
- alternative layer configurations
- impact of additional security controls

## 7. Maturity score

The code also derives a weighted maturity score from questionnaire groups. This score is not the final risk output by itself; it is an intermediate summary layer that helps explain the degradation model and recommendations.

Current maturity bands:

- below 25: Critical
- below 50: Low
- below 75: Medium
- 75 and above: High

## 8. Reporting

The reporting module exports the full assessment as PDF or DOCX and includes:

- attacker profile
- questionnaire summaries
- baseline and degraded LOPA visuals
- maturity summary
- layer degradation table
- event loss table
- conclusions and recommendations

## Important implementation assumptions

- The code uses bounded PFD values from configuration
- Event counts are derived from the number of layers plus the final breach event
- Questionnaire files are capped at 300 populated rows for local workstation safety
- The current model is deterministic; Monte Carlo is present in UI/API shape but still marked as future functionality
