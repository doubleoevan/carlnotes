# use -database instead of plain litellm: it stores virtual keys and budgets in postgres
FROM ghcr.io/berriai/litellm-database:v1.94.0

# the current list of models, copied in at build time on every push
COPY litellm-config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml"]