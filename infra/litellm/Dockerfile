# use -database instead of plain litellm: it stores virtual keys and budgets in postgres
FROM ghcr.io/berriai/litellm-database:v1.109.1@sha256:932c54440654f8f8466a85887612d95dcfb04ae2fc01257844332f4bf3b96986

# the current list of models, copied in at build time on every push
COPY litellm-config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml"]