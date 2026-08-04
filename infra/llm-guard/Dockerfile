# the scanner config, baked in at build time: northflank has no bind mounts, so the file has to live in the image.
# the build context is this folder, so the copy is relative and the repo-root .dockerignore never applies
FROM laiyer/llm-guard-api:0.3.15
COPY scanners.yml /home/user/app/config/scanners.yml