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
2. Create `backend/.env` from `.env.example`
3. Run `docker compose up --build`
4. Open `http://127.0.0.1:3000`

## Running without helper scripts

### Linux

```bash
cp .env.example backend/.env
docker compose up --build
```

### Windows

```bat
copy .env.example backend\.env
docker compose up --build
```

## LLM recommendations configuration

The default recommendation provider is OpenAI ChatGPT-compatible API access.

Set your API key in `backend/.env`:

```env
OPENAI_API_KEY=sk-your-key
```

The model endpoint is configured in `backend/config/recommendations.json`.

### Default OpenAI setup

Keep the default `api_base_url` and change the model only if needed:

```json
{
  "api_base_url": "https://api.openai.com/v1/chat/completions",
  "model": "gpt-5-nano"
}
```

### Local OpenAI-compatible model server

If you run a local endpoint such as LM Studio, vLLM, LocalAI, or another OpenAI-compatible bridge, update the config like this:

```json
{
  "api_base_url": "http://127.0.0.1:1234/v1/chat/completions",
  "model": "local-model-name"
}
```

If the local server does not require a key, you can still leave `OPENAI_API_KEY` set to any non-empty placeholder value unless your server explicitly ignores authorization.

### Other model providers

If another provider exposes an OpenAI-compatible Chat Completions API, point `api_base_url` to that provider and use its model identifier:

```json
{
  "api_base_url": "https://provider.example.com/v1/chat/completions",
  "model": "provider-model-name"
}
```

Put the provider API key into `backend/.env` as `OPENAI_API_KEY`.

## GitHub release artifacts

The `release/` folder contains ready-made launchers:

- `release/linux/start-ics-risk.sh`
- `release/linux/stop-ics-risk.sh`
- `release/windows/start-ics-risk.bat`
- `release/windows/stop-ics-risk.bat`

These files are intended to be attached to releases together with the source archive.
