import * as Sentry from "@sentry/react-native"
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

	// record route-shaped transactions and initial-display timing
	Sentry.init({
		dsn,
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
