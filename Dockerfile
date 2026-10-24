# syntax=docker/dockerfile:1

# the app service image: the Hono api plus the web app's built browser files and server build, started under Doppler.
# the litellm proxy is a separate service and builds from infra/litellm/Dockerfile, not this file.
# Bun is pinned to the version in .bun-version, which CI also reads, and to that tag's digest
FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS build
WORKDIR /app

# install against the committed lockfile on its own layer, so it caches until a dependency actually changes.
# each workspace's package.json on its own line. a glob COPY flattens them into one directory.
# patches holds the dependency patches the lockfile names, which the install applies
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

# the whole tree. the web build imports the universal packages and the docs build imports the contracts
COPY . .

# the Turnstile site key. Vite inlines it into the bundle at build time, so unlike every other setting it cannot
# wait for doppler run at start. it is a public key that ships to every visitor, so it arrives as a build argument.
# a Doppler token here would instead hand the build read access to every real secret, to inject a public one
ARG VITE_TURNSTILE_SITE_KEY
# the PostHog project key and host, which the browser sends its page views to. the same project key the server
# already uses, and public for the same reason: a project key can post events and can never read them back
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

# refuse to build without the Turnstile site key.
# Vite would otherwise inline undefined and ship a signup form whose widget never loads.
RUN test -n "$VITE_TURNSTILE_SITE_KEY" || (echo "VITE_TURNSTILE_SITE_KEY build arg is required" >&2; exit 1)
RUN bun run build:ui

# the docs site, built to static files the app service serves under /docs. Astro and Starlight are dev
# dependencies, so the toolchain stays in this stage and only the built output is copied forward
RUN bun run build:docs

# the Nightshift component browser, a static Storybook the app service serves at /nightshift. it writes into
# apps/web/dist/nightshift after build:ui, and Storybook is a dev dependency, so only the built output moves forward
RUN bun run build:storybook

# the runtime includes only what serving a request needs: production dependencies, the workspaces Bun executes, and the
# built web app and docs. the toolchain and every dev dependency stay behind in the build stage
FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS runtime
WORKDIR /app
ENV NODE_ENV=production

# the Certificate Authority bundle that the Doppler CLI verifies api.doppler.com against.
# the bun image ships without one.
# the worker joins a podcast episode's audio with ffmpeg, and the api encodes a cover, transcodes a chat recording,
# and encodes a spoken answer to MP3 with its libmp3lame encoder
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates ffmpeg \
	&& rm -rf /var/lib/apt/lists/*

# Doppler injects the secrets at start. copy its binary from its published image, pinned by version and digest
COPY --from=dopplerhq/cli:3.77.0@sha256:bc59e0e97ea596a2c402f108043b9fd6ad574db253998364de939c0ca373453e /bin/doppler /bin/doppler

# resolve production dependencies from the same lockfile the build stage used. each workspace's package.json on its
# own line. the install links each @carlnotes package into node_modules by it, and applies the dependency patches
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
RUN bun install --frozen-lockfile --production

# Bun runs the TypeScript directly, so the source is the artifact: the packages, and the two apps the image runs as.
# each workspace has its own tsconfig, and the root pair ties the project references together
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker

# the illustration that every podcast cover is drawn over
COPY apps/docs/design/podcast/cover-base.png ./apps/docs/design/podcast/cover-base.png

# the blog's markdown, which the api renders per request. the docs moved to the Starlight site above
COPY content ./content

# the built web app: the browser files the api serves, the server build the api renders pages through, and the
# Nightshift component browser under nightshift/
COPY --from=build /app/apps/web/dist ./apps/web/dist

# the built docs site, served under /docs
COPY --from=build /app/apps/docs/dist ./apps/docs/dist

# the docs markdown source, which the docs:embed deploy job chunks and embeds for chat
COPY apps/docs/src/content/docs ./apps/docs/src/content/docs

# the port that bun serves the api on if PORT is unset
EXPOSE 3000
USER bun
CMD ["doppler", "run", "--", "bun", "apps/api/index.ts"]
