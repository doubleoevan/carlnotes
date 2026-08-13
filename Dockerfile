# syntax=docker/dockerfile:1

# the app service image: the Hono api plus the built ui bundle, started under Doppler.
# the litellm proxy is a separate service and builds from infra/litellm/Dockerfile, not this file.
# Bun is pinned to the version the repo targets (@types/bun ^1.3.14) so the image and a developer's
# local runtime cannot drift apart on a patch release
FROM oven/bun:1.3.14 AS build
WORKDIR /app

# install against the committed lockfile on its own layer, so it caches until a dependency actually changes
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# the whole tree, since tsconfig project references span ui, api, worker, db, and shared.
# a narrower copy breaks the ui build the moment it imports across a module boundary
COPY . .

# the Turnstile site key. Vite inlines it into the bundle at build time, so unlike every other setting it cannot
# wait for doppler run at start. it is a public key that ships to every visitor, so it arrives as a build argument.
# a Doppler token here would instead hand the build read access to every real secret, to inject a public one
ARG VITE_TURNSTILE_SITE_KEY

# refuse to build without the Turnstile site key.
# Vite would otherwise inline undefined and ship a signup form whose widget never loads.
RUN test -n "$VITE_TURNSTILE_SITE_KEY" || (echo "VITE_TURNSTILE_SITE_KEY build arg is required" >&2; exit 1)
RUN bun run build:ui

# the runtime carries only what serving a request needs: production dependencies, the modules Bun executes, and the built bundle.
# the toolchain and every dev dependency stay behind in the build stage
FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production

# the Certificate Authority bundle the Doppler CLI verifies api.doppler.com against. the bun image ships without one
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Doppler injects the secrets at start. copied from its own published image rather than curled at build time,
# so the version is pinned and the build needs no network egress
COPY --from=dopplerhq/cli:3 /bin/doppler /bin/doppler

# resolve production dependencies from the same lockfile the build stage used
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Bun runs the TypeScript directly, so the source is the artifact. each module carries its own tsconfig,
# and the root pair resolves the @shared alias the worker and api import across
COPY tsconfig.base.json tsconfig.json ./
COPY shared ./shared
COPY db ./db
COPY emails ./emails
COPY worker ./worker
COPY api ./api
COPY content ./content

# the ui bundle the app service serves alongside the api
COPY --from=build /app/ui/dist ./ui/dist

# the api listens on 3000, matching the port api/index.ts exports
EXPOSE 3000
USER bun
CMD ["doppler", "run", "--", "bun", "api/index.ts"]