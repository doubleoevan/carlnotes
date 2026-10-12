# use -database instead of plain litellm: it stores virtual keys and budgets in postgres
FROM ghcr.io/berriai/litellm-database:v1.105.0@sha256:f99e4cc55ce8a1c6888504ac6eff147868979d37363a7246cf804bbabdc27e88

# the current list of models, copied in at build time on every push
COPY litellm-config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml"]