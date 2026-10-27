import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@carlnotes/contracts/analyticsEvents"
import { toReportedPath } from "@carlnotes/contracts/reportedPath"
import { toReportedEvent } from "@carlnotes/contracts/visitAnalytics"
import PostHog from "posthog-react-native"
import { deviceTelemetry } from "./deviceTelemetry"

// keep anonymous visit identifiers and queued events in memory for this app runtime only
const projectKey = process.env.EXPO_PUBLIC_POSTHOG_KEY
export const visitAnalytics = projectKey
	? new PostHog(projectKey, {
			host: process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
			persistence: "memory",
			enableSessionReplay: false,
			captureAppLifecycleEvents: false,
			disableGeoip: true,
			disableRemoteFeatureFlags: true,
			before_send: (event) => {
				if (!event) {
					return event
				}
				// apply the shared route policy and prohibit person profiles for native visits
				const properties = event.properties ?? {}
				event.properties = properties
				// omit SDK device names and persistent identifiers while retaining model and OS dimensions
				for (const key of ["$device_name", "$device_id", "$device_advertising_id", "$set", "$set_once"]) {
					delete properties[key]
				}
				Object.assign(properties, deviceTelemetry, {
					environment: __DEV__ ? "development" : "production",
					$process_person_profile: false,
				})
				if (typeof properties.$screen_name === "string") {
					properties.$screen_name = toReportedPath(properties.$screen_name)
				}
				return toReportedEvent(event)
			},
		})
	: undefined

/** Records the web's visit event names with the native device context. */
export function captureVisitEvent(event: VisitAnalyticsEvent, properties: AnalyticsEventProperties = {}): void {
	visitAnalytics?.capture(event, properties)
}

/** Records a screen by its route pattern without a note, topic, profile, or invitation identity. */
export function captureVisit(pathname: string): void {
	visitAnalytics?.screen(toReportedPath(pathname))
}

// public topic attribution follows the same rule in both clients
export { toPublicTopicProperties } from "@carlnotes/contracts/visitAnalytics"
