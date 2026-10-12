# use -database instead of plain litellm: it stores virtual keys and budgets in postgres
FROM ghcr.io/berriai/litellm-database:v1.94.0@sha256:8075b09298dc2453316ebe6152603da34d4b1a0661a3cd756a11191a5b40d59c

# the current list of models, copied in at build time on every push
COPY litellm-config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml"]