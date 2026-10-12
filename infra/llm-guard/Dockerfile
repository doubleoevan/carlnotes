# the scanner config, baked in at build time: northflank has no bind mounts, so the file has to live in the image.
# the build context is this folder, so the copy is relative and the repo-root .dockerignore never applies
FROM laiyer/llm-guard-api:0.3.16@sha256:bea3efb1220ad18149b73de625c55e6d835bf8b45023a089a3762012a86550ba
COPY scanners.yml /home/user/app/config/scanners.yml