# use -database instead of plain litellm: it stores virtual keys and budgets in postgres
FROM ghcr.io/berriai/litellm-database:1.110.2@sha256:3b239acc68e601c436e5feeec7ca0f01a41cd5dffe50975142b7fa7155c1b2ff

# the current list of models, copied in at build time on every push
COPY litellm-config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml"]