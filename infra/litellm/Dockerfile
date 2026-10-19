# use -database instead of plain litellm: it stores virtual keys and budgets in postgres
FROM ghcr.io/berriai/litellm-database:v1.106.0@sha256:80a12a210e6626e39daaa31fb6ce70f4c4d97ee10e21d4584a9e87f45bf3a2f1

# the current list of models, copied in at build time on every push
COPY litellm-config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml"]