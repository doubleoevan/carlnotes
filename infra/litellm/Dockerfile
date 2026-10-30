# use -database instead of plain litellm: it stores virtual keys and budgets in postgres
FROM ghcr.io/berriai/litellm-database:v1.106.6@sha256:7ef0e78fe00ad5ea7ea45666cc1d1f02cb7076aee69091543bf397de52db33ce

# the current list of models, copied in at build time on every push
COPY litellm-config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml"]