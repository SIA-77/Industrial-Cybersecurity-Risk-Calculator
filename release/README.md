# Release Artifacts

This directory contains practical launch artifacts for local workstation execution.

## Linux

- `linux/start-ics-risk.sh`
- `linux/stop-ics-risk.sh`

## Windows

- `windows/start-ics-risk.bat`
- `windows/stop-ics-risk.bat`

These launchers use Docker Compose and are the recommended release artifacts for this repository.

Why scripts instead of a single `.exe`:

- the project contains both a Python backend and a Next.js frontend
- Docker gives stable, reproducible execution on both Linux and Windows

