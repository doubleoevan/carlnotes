// pure push rules: what a permission read means for a push, a phone's registration payload, and whether a push token
// report registers the phone again

import type { MobilePlatform } from "@carlnotes/contracts/clientTelemetry"
import type { PushDevicePayload } from "@carlnotes/contracts/pushDevices"
import type { PushPermission } from "@carlnotes/core/components/NotificationsSection"
import type { NotificationPermissionsStatus } from "expo-notifications"

// the version a build with no native version reports, which only a development client has
const UNKNOWN_APP_VERSION = "0.0.0"

/**
 * Returns what a permission read means for a push: allowed, denied, or never asked. An iOS grant without alerts
 * reads as denied.
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

// a registration that the token listener can start, and the listener that the phone's token reports call
export type PushTokenRegistration = {
	register: () => Promise<void>
	handlePushToken: (devicePushToken: { data: unknown }) => void
}

/**
 * Returns the registration, with isRegistering true while it runs, and the token listener that registers again only for
 * a changed token. iOS reports the token on every read, a registration's own read included, so a report during a
 * registration or a repeat of the last token never registers again.
 */
export function toPushTokenRegistration(registerPushDevice: () => Promise<void>): PushTokenRegistration {
	// the last token that the phone reported, and whether a registration is running
	let lastDevicePushToken: unknown = null
	let isRegistering = false

	// register, with isRegistering true while it runs
	const register = async (): Promise<void> => {
		isRegistering = true
		try {
			await registerPushDevice()
		} finally {
			isRegistering = false
		}
	}

	// a report outside a registration that names a new token registers again
	const handlePushToken = ({ data }: { data: unknown }): void => {
		const isPushTokenChanged = !isRegistering && data !== lastDevicePushToken
		lastDevicePushToken = data
		if (isPushTokenChanged) {
			void register()
		}
	}

	// the registration and the listener
	return { register, handlePushToken }
}
