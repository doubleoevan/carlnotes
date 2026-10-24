// the metro config. sentry's base config gives the bundles debug ids. uniwind wraps outermost as its docs require.
// expo configures metro for the monorepo and the isolated install on its own, so nothing else is set
const { getSentryExpoConfig } = require("@sentry/react-native/metro")
const { withUniwindConfig } = require("uniwind/metro")

module.exports = withUniwindConfig(getSentryExpoConfig(__dirname), {
	cssEntryFile: "./global.css",
	dtsFile: "./uniwind-types.d.ts",
})
