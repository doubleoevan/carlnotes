// pure push rules: what a permission read means for a push, and a phone's registration payload

import type { MobilePlatform } from "@carlnotes/contracts/clientTelemetry"
import type { PushDevicePayload } from "@carlnotes/contracts/pushDevices"
import type { PushPermission } from "@carlnotes/core/components/NotificationsSection"
import type { NotificationPermissionsStatus } from "expo-notifications"

// the version a build with no native version reports, which only a development client has
const UNKNOWN_APP_VERSION = "0.0.0"

/**
 * Returns what a permission read means for a push: allowed, refused, or never asked. An iOS grant without alerts
 * reads as refused.
 */
export function toPushPermission(
	permissions: Pick<NotificationPermissionsStatus, "status" | "ios">,
	platform: string,
): PushPermission {
	if (permissions.status === "undetermined") {
		return "undetermined"
	}
	if (permissions.status !== "granted") {
		return "denied"
	}

	// an iOS grant must allow alerts too
	return platform === "ios" && permissions.ios?.allowsAlert !== true ? "denied" : "granted"
}

/**
 * Returns a phone's registration, naming the token it registered before only if the token changed.
 */
export function toPushDevicePayload({
	expoPushToken,
	previousExpoPushToken,
	platform,
	appVersion,
}: {
	expoPushToken: string
	previousExpoPushToken: string | null
	platform: MobilePlatform
	appVersion: string | undefined
}): PushDevicePayload {
	return {
		expoPushToken,
		platform,
		appVersion: appVersion ?? UNKNOWN_APP_VERSION,
		...(previousExpoPushToken && previousExpoPushToken !== expoPushToken ? { previousExpoPushToken } : {}),
	}
}
