# Docker deploy files

Compose, Dockerfile, and entrypoint for the GHCR image.

**Full setup guide:** [../README.md](../README.md) (features, user flows, reverse proxy, admin tabs).

| File | Purpose |
|------|---------|
| [docker-compose.yml](./docker-compose.yml) | Local build or pull |
| [compose.unraid.yaml](./compose.unraid.yaml) | Unraid / homelab example |
| [.env.example](./.env.example) | `APP_DATA`, ports, `IMAGE` |
| [Dockerfile](./Dockerfile) | Multi-stage image build |
