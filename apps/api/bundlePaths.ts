// where the build scripts write the files the api serves, relative to the repo root the server runs from

// where build:docs writes the Starlight site
export const DOCS_BUNDLE_ROOT = "./apps/docs/dist"

// where build:storybook writes the Nightshift component browser, which the api serves at /nightshift
export const NIGHTSHIFT_BUNDLE_ROOT = "./apps/web/dist/nightshift"

// where build:ui writes the web app's browser files
export const UI_CLIENT_ROOT = "./apps/web/dist/client"

// where build:ui writes the web app's server entry, which renders every page no other route serves
export const UI_SERVER_ENTRY = "apps/web/dist/server/server.js"
