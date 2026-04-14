# Installation and GitHub Preparation

## Required software

### For end users

- Docker Desktop on Windows
- Docker Engine + Docker Compose on Linux

### For contributors

- Python 3.10+
- Node.js 18+
- Docker

## Standard run procedure

1. Clone the repository
2. Create `.env` from `.env.example`
3. Run `docker compose up --build`
4. Open `http://127.0.0.1:3000`

## Running without helper scripts

### Linux

```bash
cp .env.example .env
docker compose up --build
```

### Windows

```bat
copy .env.example .env
docker compose up --build
```

## GitHub release artifacts

The `release/` folder contains ready-made launchers:

- `release/linux/start-ics-risk.sh`
- `release/linux/stop-ics-risk.sh`
- `release/windows/start-ics-risk.bat`
- `release/windows/stop-ics-risk.bat`

These files are intended to be attached to releases together with the source archive.
