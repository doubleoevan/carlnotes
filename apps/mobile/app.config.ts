// the expo app config: the identity, the EAS project link, the icon and splash, and the config plugins
import { colors } from "@carlnotes/nightshift/colors"
import { withSentry } from "@sentry/react-native/expo"
import type { ExpoConfig } from "expo/config"

// the EAS project the app links to. eas init cannot write into a dynamic config, so the id lives here
const EAS_PROJECT_ID = "7b874ce7-cb2a-4d50-a8d7-fb89e078b247"

// the app: CarlNotes, its store identifiers, and the url scheme the sign-in change redirects through
const expoConfig: ExpoConfig = {
	name: "CarlNotes",
	slug: "carlnotes",
	owner: "carlnotes",
	scheme: "carlnotes",
	version: "0.1.0",
	orientation: "portrait",
	icon: "./assets/icon.png",
	userInterfaceStyle: "automatic",
	ios: {
		bundleIdentifier: "com.carlnotes.app",
		supportsTablet: true,
	},
	android: {
		package: "com.carlnotes.app",
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			backgroundColor: colors.background.light,
		},
	},
	// the fingerprint policy bumps the runtime whenever anything that could affect the native runtime changes. an
	// EAS Update then never reaches an incompatible build
	runtimeVersion: {
		policy: "fingerprint",
	},
	updates: {
		url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
	},
	extra: {
		eas: {
			projectId: EAS_PROJECT_ID,
		},
	},
	plugins: [
		"expo-router",
		[
			"expo-splash-screen",
			{
				image: "./assets/icon.png",
				imageWidth: 200,
				backgroundColor: colors.background.light,
				dark: {
					backgroundColor: colors.background.dark,
				},
			},
		],
	],
}

// sentry wraps the config. an EAS release build then uploads its bundles and source maps, reading SENTRY_AUTH_TOKEN
// from the EAS environment. the organization and project are not secrets and live here instead of Doppler
export default withSentry(expoConfig, {
	url: "https://sentry.io/",
	organization: "carlnotes",
	project: "carlnotes-mobile",
})
