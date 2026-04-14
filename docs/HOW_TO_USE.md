# How to Use

## Before you start

Prepare the following:

- a completed technical questionnaire in CSV format
- an optional organizational questionnaire in CSV format
- a protection layer list with baseline PFD values
- attacker assumptions
- estimated single loss expectancy values for each event

Use the questionnaire templates shipped in:

- `frontend/public/questionnaires/`

## Workflow

### 1. Start the application

Run:

```bash
docker compose up --build
```

Open `http://127.0.0.1:3000`.

## 2. Input data

In the `Input data` tab:

- download questionnaire templates (if you havn't completed them already)
- upload completed CSV questionnaires
- choose attacker type and capability
- configure SIS integration
- define the protection layers and their `pfd` values
- mark which layers are subject to cyber attack
- enter maximum acceptable loss and per-event SLE (single loss expectancy) values

## 3. Review the LOPA diagram

Use the `LOPA Diagram` tab to confirm that the sequence of barriers matches the intended scenario.

Check:

- layer order
- barrier naming
- which layers are cyber-exposed
- whether the final breach path is represented correctly

## 4. Run the risk assessment

Open the `Risk assessment` tab to calculate:

- maturity score
- degraded layer PFD values
- event probabilities by year
- expected event losses

This is the main quantitative output of the application.

## 5. Generate recommendations

If `backend/.env` contains `OPENAI_API_KEY`, you can use the `Recommendations` tab.

The backend will:

- build a structured payload from the assessment
- load report requirements from backend configuration
- call the configured model endpoint
- return generated recommendations

By default the report language is English. For different language please type additional comments fro AI before generating the report.

The default setup uses an OpenAI ChatGPT-compatible endpoint defined in `backend/config/recommendations.json`. You can switch to another OpenAI model, a local OpenAI-compatible server, or another provider with a compatible API by editing:

- `api_base_url`
- `model`
- `proxy` if needed

## 6. Export a report

Use the report export control to create:

- PDF
- DOCX

The exported report includes questionnaire summaries, LOPA visuals, risk tables, and conclusions.

## File requirements

### Questionnaires

- format: `.csv`
- maximum populated rows: `300`
- expected columns:

`Group`, `Group Name`, `Question ID`, `Question`, `Score`, `Max Score`, `Scoring Guidance`, `Evidence`

### Layer input

Each layer must include:

- `name`
- `pfd` between `0` and `1`

Optional:

- `cyber`

## Configuration

### `.env`

Create `backend/.env`:

```env
OPENAI_API_KEY=sk-your-key
```

Recommended examples:

Default OpenAI:

```json
{
  "api_base_url": "https://api.openai.com/v1/chat/completions",
  "model": "gpt-5-nano"
}
```

Local OpenAI-compatible server:

```json
{
  "api_base_url": "http://127.0.0.1:1234/v1/chat/completions",
  "model": "local-model-name"
}
```

Other provider with compatible API:

```json
{
  "api_base_url": "https://provider.example.com/v1/chat/completions",
  "model": "provider-model-name"
}
```

## Local workstation defaults

The repository is hardened for local use:

- frontend and backend ports are bound to `127.0.0.1`
- backend CORS is limited to localhost origins by default
- large questionnaire uploads are rejected above 300 rows

## Troubleshooting

### Recommendations endpoint returns unavailable

Check that:

- `backend/.env` exists
- `OPENAI_API_KEY` is set
- the configured model endpoint is reachable

### PDF export shows font issues

The backend container installs `DejaVu Sans` and the reporting code registers Unicode-capable fonts. Rebuild the backend image if you changed dependencies:

```bash
docker compose up --build
```

### Questionnaire is rejected

Check:

- CSV extension
- row count under 300
- required columns present
- numeric values in `Score` and `Max Score`
