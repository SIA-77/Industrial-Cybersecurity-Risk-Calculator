# ICS Cybersecurity Risk Calculator

Open-source local-first application for quantitative ICS/OT cyber risk assessment.

The software estimates how cyberattacks degrade protection layers, change scenario probability, and affect expected business loss. It combines questionnaire results, attacker assumptions, LOPA-style modeling, and report export into one web application.

Copyright holder: Ian Suhih.

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

### Recommended: Docker

This is the default and most stable way to run the project.

Requirements:

- Docker
- Docker Compose

Quick start:

1. Copy `.env.example` to `.env`
2. Fill `OPENAI_API_KEY` if you want recommendations
3. Run:

```bash
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

The backend reads `OPENAI_API_KEY` from:

1. `backend/.env`
2. repository root `.env`

Example:

```env
OPENAI_API_KEY=sk-your-test-or-production-key
```

Optional:

```env
BACKEND_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
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
