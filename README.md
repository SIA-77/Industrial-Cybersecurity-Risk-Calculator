# ICS Cybersecurity Risk Calculator

Open-source local-first application for quantitative ICS/OT cyber risk assessment.

The software estimates how cyberattacks degrade protection layers, change scenario probability, and affect expected business loss. It combines questionnaire results, attacker assumptions, LOPA-style modeling, and report export into one web application.

Copyright holder: Ian Suhih.
<img width="2860" height="1795" alt="image" src="https://github.com/user-attachments/assets/2e077d5f-f4ac-456b-bd2c-3d1972721ff2" />


## Repository contents

- `backend/`: FastAPI API, calculation engine, recommendations integration, report generation
- `frontend/`: Next.js user interface
- `docs/`: user and methodology documentation
- `tests/`: automated backend tests
- `release/`: ready-to-use startup artifacts for Linux and Windows

## Main features

- Technical and organizational questionnaire parsing from CSV
- LOPA-style barrier sequence modeling
- Cyber degradation of selected protection layers
- Attacker-aware risk calculation
- Event probability and expected loss estimation
- PDF and DOCX report export
- Optional LLM-based recommendations
- Multilingual frontend

## Supported local deployment modes

## Quick Start

This is the shortest path for a first local run using the included release launchers.

### Linux

1. Create a working directory and enter it:

```bash
mkdir -p ~/projects
cd ~/projects
```

2. Clone the repository over HTTPS:

```bash
git clone https://github.com/SIA-77/Industrial-Cybersecurity-Risk-Calculator.git
cd Industrial-Cybersecurity-Risk-Calculator
```

3. Start the stack with the release launcher:

```bash
./release/linux/start-ics-risk.sh
```

4. Optional: if you want AI recommendations, open `backend/.env` in a text editor and add your key:

```env
OPENAI_API_KEY=sk-your-key
```

If you do not need recommendations, you can skip this step and run the application without an API key.

5. Open:

- frontend: `http://127.0.0.1:3000`
- backend: `http://127.0.0.1:8000`

6. Stop the stack when needed:

```bash
./release/linux/stop-ics-risk.sh
```

### Windows

1. Create a working directory and enter it:

```bat
mkdir C:\projects
cd /d C:\projects
```

2. Clone the repository over HTTPS:

```bat
git clone https://github.com/SIA-77/Industrial-Cybersecurity-Risk-Calculator.git
cd /d Industrial-Cybersecurity-Risk-Calculator
```

3. Optional: if you want AI recommendations, open `backend\.env` in a text editor and add your key:

```env
OPENAI_API_KEY=sk-your-key
```

If you do not need recommendations, you can skip this step and run the application without an API key.

4. Start the stack with the release launcher:

```bat
release\windows\start-ics-risk.bat
```

5. Open:

- frontend: `http://127.0.0.1:3000`
- backend: `http://127.0.0.1:8000`

6. Stop the stack when needed:

```bat
release\windows\stop-ics-risk.bat
```

### Recommended: Docker

This is the default and most stable way to run the project.

Requirements:

- Docker
- Docker Compose

Quick start:

1. Copy `.env.example` to `backend/.env`
2. Fill `OPENAI_API_KEY` if you want recommendations
3. Run:

```bash
cp .env.example backend/.env
docker compose up --build
```

4. Open:

- frontend: `http://127.0.0.1:3000`
- backend: `http://127.0.0.1:8000`

### Helper launchers

Ready-made launchers are included:

- Linux: [release/linux/start-ics-risk.sh](/home/ian/risk_assesment_standalone/release/linux/start-ics-risk.sh)
- Linux stop: [release/linux/stop-ics-risk.sh](/home/ian/risk_assesment_standalone/release/linux/stop-ics-risk.sh)
- Windows: [release/windows/start-ics-risk.bat](/home/ian/risk_assesment_standalone/release/windows/start-ics-risk.bat)
- Windows stop: [release/windows/stop-ics-risk.bat](/home/ian/risk_assesment_standalone/release/windows/stop-ics-risk.bat)

These scripts are the practical executable artifacts for local deployment on Linux and Windows.

## Configuration

Recommended location for runtime secrets:

- `backend/.env`

This is the recommended path for Docker runs because the backend container mounts the `backend/` directory directly.

The backend also has a fallback lookup for the repository root `.env`, but that should not be relied on for standard Docker deployment.

Example:

```env
OPENAI_API_KEY=sk-your-test-or-production-key
```

Optional:

```env
BACKEND_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

## Recommendation model configuration

By default the project is configured to use an OpenAI ChatGPT-compatible endpoint through [backend/config/recommendations.json](/home/ian/risk_assesment_standalone/backend/config/recommendations.json:1).

Default fields:

```json
{
  "api_base_url": "https://api.openai.com/v1/chat/completions",
  "model": "gpt-5-nano",
  "proxy": ""
}
```

To use a different OpenAI model, change only the `model` value:

```json
{
  "api_base_url": "https://api.openai.com/v1/chat/completions",
  "model": "gpt-4o-mini"
}
```

To use a local OpenAI-compatible server such as LM Studio, vLLM, LocalAI, or Ollama behind a compatibility layer, point `api_base_url` to the local endpoint and set the model name exposed by that server:

```json
{
  "api_base_url": "http://127.0.0.1:1234/v1/chat/completions",
  "model": "local-model-name"
}
```

To use another provider with an OpenAI-compatible API, set its endpoint and model identifier, then place that provider's API key into `backend/.env` as `OPENAI_API_KEY`:

```json
{
  "api_base_url": "https://your-provider.example.com/v1/chat/completions",
  "model": "provider-model-name"
}
```

If your environment needs an outbound proxy for model access, set `proxy` in the same config file:

```json
{
  "proxy": "http://proxy-host:port"
}
```

## Documentation

- [Overview](docs/OVERVIEW.md)
- [Methodology](docs/METHODOLOGY.md)
- [How to Use](docs/HOW_TO_USE.md)
- [Installation and GitHub Prep](docs/INSTALLATION.md)
- [Contributing](CONTRIBUTING.md)
- [Copyright](COPYRIGHT)
- [Notice](NOTICE)

## Authorship and AI Assistance

The original methodology, domain model, and project direction were created by Ian Suhih.

This repository was developed with the assistance of AI-based tools, including ChatGPT/OpenAI tools. All final technical, editorial, and methodological decisions were made by Ian Suhih.

## Tests

Tests are isolated in the `tests/` directory.

Local Docker-based run:

```bash
docker compose build backend
docker run --rm -v "$PWD:/workspace" -w /workspace risk_assesment_standalone-backend pytest tests
```

## GitHub readiness

The repository has been cleaned for open-source publication:

- cache and build directories are ignored
- `.env` is ignored
- internal scratch files were removed
- documentation is rewritten for external users
- release launchers for Linux and Windows are included

## License

This project is distributed under the GNU General Public License v3.0. See [LICENSE](LICENSE), [COPYRIGHT](COPYRIGHT), and [NOTICE](NOTICE).

## Notes on distributable artifacts

This project contains both a Python backend and a Next.js frontend. A single native `.exe` or standalone Linux binary for the entire system is not a good fit without introducing a larger packaging layer and more maintenance overhead.

For that reason, this repository ships practical cross-platform execution artifacts based on Docker:

- `.sh` launchers for Linux
- `.bat` launchers for Windows
- optional zipped release folders under `release/`

This is the most reliable way to run the full stack on local workstations.
