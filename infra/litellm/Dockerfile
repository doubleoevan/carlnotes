# use -database instead of plain litellm: it stores virtual keys and budgets in postgres
FROM ghcr.io/berriai/litellm-database:v1.106.4@sha256:db36453d25e76c9eb689d7d51b8e5fa48843243d7a86ed1284cf574ce0107b3f

# the current list of models, copied in at build time on every push
COPY litellm-config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml"]