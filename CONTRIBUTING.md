# Contributing

Thanks for contributing to this project.

## Ownership and license

The original work in this repository is authored by Ian Suhih.

- Copyright holder: Ian Suhih
- License: GNU General Public License v3.0

By contributing to this repository, you agree that your contribution may be distributed under the same license.

## Before opening an issue

Please include:

- what you tried to do
- what you expected to happen
- what actually happened
- reproduction steps
- logs or screenshots when relevant

For bug reports, use the smallest reproducible example you can provide.

## Before opening a pull request

Please make sure that:

- the change is focused and scoped
- documentation is updated when behavior changes
- tests are added or updated for critical behavior
- no secrets or local `.env` files are included
- build artifacts and caches are not committed

## Development workflow

### Recommended local workflow

Run the project with Docker:

```bash
docker compose up --build
```

### Run tests

```bash
docker compose build backend
docker run --rm -v "$PWD:/workspace" -w /workspace risk_assesment_standalone-backend pytest tests
```

## Code expectations

- keep changes readable and explicit
- prefer small pull requests over large mixed changes
- preserve local-first behavior
- do not loosen security defaults without a strong reason
- keep tests in the separate `tests/` directory

## Documentation expectations

Update these files when relevant:

- `README.md`
- `docs/OVERVIEW.md`
- `docs/METHODOLOGY.md`
- `docs/HOW_TO_USE.md`
- `docs/INSTALLATION.md`

## Security

Do not commit:

- `.env`
- API keys
- customer data
- generated reports containing sensitive operational data

If you find a security issue, avoid posting sensitive exploit details publicly before the maintainer has a chance to review them.
