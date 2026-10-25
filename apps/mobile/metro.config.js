// the Metro config. Sentry's base config gives the bundles debug ids. Storybook's wrapper writes the stories index in
// development and empties every Storybook module in a production bundle. Uniwind wraps outermost as its docs require.
// Expo configures Metro for the monorepo and the isolated install on its own, so nothing else is set
const path = require("node:path")
const { getSentryExpoConfig } = require("@sentry/react-native/metro")
const { withStorybook } = require("@storybook/react-native/metro/withStorybook")
const { withUniwindConfig } = require("uniwind/metro")

// turn Storybook on outside production. Expo's CLI sets NODE_ENV to production before it reads this file for an export,
// a release build, or an update
const isStorybookEnabled = process.env.NODE_ENV !== "production"

// keep Storybook's telemetry off however Metro starts. withStorybook reads the flag when it runs
process.env.STORYBOOK_DISABLE_TELEMETRY ??= "1"

module.exports = withUniwindConfig(
	withStorybook(getSentryExpoConfig(__dirname), {
		enabled: isStorybookEnabled,
		configPath: path.resolve(__dirname, ".rnstorybook"),
	}),
	{ cssEntryFile: "./global.css", dtsFile: "./uniwind-types.d.ts" },
)
