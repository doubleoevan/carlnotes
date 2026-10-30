import type { TolerantReadIssue } from "@carlnotes/client/apiClient"
import { MOBILE_APP_BUNDLE_IDENTIFIER } from "@carlnotes/contracts/mobileApp"
import * as Sentry from "@sentry/react-native"
import * as Application from "expo-application"
import * as Updates from "expo-updates"
import { deviceTelemetry } from "./deviceTelemetry"
import { isPrivateBreadcrumbCategory, redactMobileEvent } from "./monitoringRedaction"

// use the public navigation ref. Expo Router 58 moved the internal router-store module
export const navigationIntegration: ReturnType<typeof Sentry.reactNavigationIntegration> =
	Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: true })

/** Starts native crash, render error, and navigation monitoring when the build has a DSN. */
export function startMonitoring(): void {
	const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
	if (!dsn) {
		return
	}

	// record route-shaped transactions and initial-display timing, under the build's release and the loaded update's dist
	Sentry.init({
		dsn,
		release: toSentryRelease(),
		dist: Updates.updateId ?? Application.nativeBuildVersion ?? undefined,
		environment: __DEV__ ? "development" : "production",
		sendDefaultPii: false,
		tracesSampleRate: 0.1,
		integrations: [navigationIntegration],
		beforeSend: redactMobileEvent,
		beforeSendTransaction: redactMobileEvent,
		beforeBreadcrumb: (breadcrumb) => (isPrivateBreadcrumbCategory(breadcrumb.category) ? null : breadcrumb),
		initialScope: { tags: deviceTelemetry },
	})
}

/**
 * Returns the Sentry release the build reports under: the package, its version, and its build number.
 */
function toSentryRelease(): string | undefined {
	// no release without a native app version
	const appVersion = Application.nativeApplicationVersion
	if (!appVersion) {
		return undefined
	}

	// the package, its version, and its build number
	const buildSuffix = Application.nativeBuildVersion ? `+${Application.nativeBuildVersion}` : ""
	return `${MOBILE_APP_BUNDLE_IDENTIFIER}@${appVersion}${buildSuffix}`
}

/**
 * Records a tolerant parse that dropped entries, with the route and the dropped entry count.
 */
export function reportTolerantReadIssue({ route, droppedEntryCount }: TolerantReadIssue): void {
	Sentry.captureMessage("tolerant read dropped entries", {
		level: "warning",
		tags: { route },
		extra: { droppedEntryCount },
	})
}
