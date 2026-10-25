// the expo app config: the identity, the EAS project link, the icon and splash, and the config plugins
import { MOBILE_APP_BUNDLE_IDENTIFIER, MOBILE_APP_SCHEME } from "@carlnotes/contracts/mobileApp"
import { colors } from "@carlnotes/nightshift/colors"
import { withSentry } from "@sentry/react-native/expo"
import type { ExpoConfig } from "expo/config"

// the EAS project the app links to. eas init cannot write into a dynamic config, so the id lives here
const EAS_PROJECT_ID = "7b874ce7-cb2a-4d50-a8d7-fb89e078b247"

// the app: CarlNotes, its store identifiers, and the url scheme a browser sign-in returns through
const expoConfig: ExpoConfig = {
	name: "CarlNotes",
	slug: "carlnotes",
	owner: "carlnotes",
	scheme: MOBILE_APP_SCHEME,
	version: "0.1.0",
	orientation: "portrait",
	icon: "./assets/icon.png",
	userInterfaceStyle: "automatic",
	ios: {
		bundleIdentifier: MOBILE_APP_BUNDLE_IDENTIFIER,
		supportsTablet: true,
		// the native Sign in with Apple sheet
		usesAppleSignIn: true,
		// App Attest in Apple's production environment on every build. a store or TestFlight build ignores the setting
		// and uses production anyway, and an ad hoc preview build follows it. a preview build then attests against the
		// production api
		entitlements: {
			"com.apple.developer.devicecheck.appattest-environment": "production",
		},
	},
	android: {
		package: MOBILE_APP_BUNDLE_IDENTIFIER,
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			// the cream behind the hand and the mug in the app icon
			backgroundColor: "#e1d0b8",
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
		"expo-apple-authentication",
		"expo-secure-store",
		"expo-web-browser",
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
