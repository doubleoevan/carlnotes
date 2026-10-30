# syntax=docker/dockerfile:1

# the capture container's image: Playwright's pinned Chromium and system fonts on amd64, the Bun that .bun-version
# pins, the locked dependencies, and the repo. every web capture runs in the container, in CI and on a laptop, so the
# same pixels come out everywhere.
# build it from the repo root: docker build --platform linux/amd64 -f ui-tests/Dockerfile .
FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS bun
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea

# the base image every image capture's environment id names. it repeats the FROM line above, and a unit test checks they
# match
ENV UI_TESTS_BASE_IMAGE=mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea

# Bun, with bunx beside it as the Bun image has it
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
WORKDIR /repo

# install against the committed lockfile on its own layer, so it caches until a dependency changes. each workspace's
# package.json on its own line, as the app image installs them, without the mobile workspace
COPY package.json bun.lock ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/
COPY apps/docs/package.json ./apps/docs/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/client/package.json ./packages/client/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/emails/package.json ./packages/emails/
COPY packages/models/package.json ./packages/models/
COPY packages/nightshift/package.json ./packages/nightshift/
COPY packages/pipeline/package.json ./packages/pipeline/
COPY packages/server/package.json ./packages/server/
RUN bun install --frozen-lockfile

# the whole tree. a run mounts the output folder over ui-tests/output, which Dockerfile.dockerignore leaves out
COPY . .
