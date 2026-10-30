// the expo app config: the identity, the EAS project link, the icon and splash, and the config plugins
import { toAndroidAppLinkIntentFilters } from "@carlnotes/contracts/appLinkPaths"
import {
	MOBILE_APP_BUNDLE_IDENTIFIER,
	MOBILE_APP_EXPO_OWNER,
	MOBILE_APP_EXPO_SLUG,
	MOBILE_APP_SCHEME,
} from "@carlnotes/contracts/mobileApp"
import { SITE_HOST } from "@carlnotes/contracts/site"
import { colors } from "@carlnotes/nightshift/colors"
import { withSentry } from "@sentry/react-native/expo"
import type { ExpoConfig } from "expo/config"
import { withAndroidManifest } from "expo/config-plugins"

// the EAS project the app links to. eas init cannot write into a dynamic config, so the id lives here
const EAS_PROJECT_ID = "7b874ce7-cb2a-4d50-a8d7-fb89e078b247"

// the app: CarlNotes, its store identifiers, and the url scheme a browser sign-in returns through
const expoConfig: ExpoConfig = {
	name: "CarlNotes",
	slug: MOBILE_APP_EXPO_SLUG,
	owner: MOBILE_APP_EXPO_OWNER,
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
		// the app uses only transport encryption and the system keychain, which the export rules exempt
		infoPlist: { LSApplicationQueriesSchemes: ["podcast"], ITSAppUsesNonExemptEncryption: false },
		// the site's links open in the app, and saved sign-ins are shared with the site
		associatedDomains: [`applinks:${SITE_HOST}`, `webcredentials:${SITE_HOST}`],
		// App Attest in Apple's production environment on every build. a store or TestFlight build ignores the setting
		// and uses production anyway, and an ad hoc preview build follows it. a preview build then attests against the
		// production api
		entitlements: {
			"com.apple.developer.devicecheck.appattest-environment": "production",
		},
	},
	android: {
		package: MOBILE_APP_BUNDLE_IDENTIFIER,
		softwareKeyboardLayoutMode: "resize",
		// the site's links open in the app once the asset links verify
		intentFilters: toAndroidAppLinkIntentFilters(SITE_HOST),
		// Firebase's file for push delivery, which EAS provides as the GOOGLE_SERVICES_JSON file variable. a local build
		// without it builds, and receives no push
		googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
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
		// push notifications: the iOS push entitlement and Android's notification accent
		["expo-notifications", { color: colors.primary.light }],
		[
			"expo-audio",
			{
				enableBackgroundPlayback: true,
				enableBackgroundRecording: false,
				microphonePermission: false,
				recordAudioAndroid: false,
			},
		],
		[
			"expo-image-picker",
			{
				photosPermission: "Choose photos to attach in chat, add to a topic, or use as an avatar.",
				cameraPermission: "Take a photo to attach in chat, add to a topic, or use as an avatar.",
				microphonePermission: false,
			},
		],
		[
			"expo-splash-screen",
			{
				image: "./assets/splash-light.png",
				imageWidth: 280,
				resizeMode: "contain",
				backgroundColor: colors.background.light,
				dark: {
					image: "./assets/splash-dark.png",
					backgroundColor: colors.background.dark,
				},
			},
		],
	],
}

// sentry wraps the config. an EAS release build then uploads its bundles and source maps, reading SENTRY_AUTH_TOKEN
// from the EAS environment. the organization and project are not secrets and live here instead of Doppler
export default withSentry(withPodcastAppQueries(expoConfig), {
	url: "https://sentry.io/",
	organization: "carlnotes",
	project: "carlnotes-mobile",
})

// query only apps that handle podcast feeds, preserving other plugins' manifest entries
function withPodcastAppQueries(config: ExpoConfig): ExpoConfig {
	return withAndroidManifest(config, (result) => {
		const manifest = result.modResults.manifest
		const queries = manifest.queries ?? []
		const hasPodcastQuery = queries.some((query) =>
			query.intent?.some((intent) => intent.data?.some((data) => data.$["android:scheme"] === "pcast")),
		)
		if (!hasPodcastQuery) {
			queries.push({
				intent: [
					{
						action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
						data: [{ $: { "android:scheme": "pcast" } }],
					},
				],
			})
		}
		manifest.queries = queries
		return result
	})
}
