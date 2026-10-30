// the push calls: register the phone's Expo push token, unregister it, and save one kind of push on or off. a call
// passes the token through to the api and keeps nothing
import type { PushDevicePayload, PushNotificationKind } from "@carlnotes/contracts/pushDevices"
import { apiClient } from "./apiClient"

/**
 * Registers the phone's push token for the signed-in session. Throws an error on a rejection.
 */
export async function sendPushDevice(pushDevice: PushDevicePayload): Promise<void> {
	const response = await apiClient().api["push-devices"].$post({ json: pushDevice })
	if (!response.ok) {
		throw new Error(`push device registration failed: ${response.status}`)
	}
}

/**
 * Unregisters the phone's push token from the signed-in session. Throws an error on a rejection.
 */
export async function sendDeletePushDevice(expoPushToken: string): Promise<void> {
	const response = await apiClient().api["push-devices"].$delete({ json: { expoPushToken } })
	if (!response.ok) {
		throw new Error(`push device unregister failed: ${response.status}`)
	}
}

/**
 * Turns one kind of push on or off for the signed-in user. Throws an error on a rejection.
 */
export async function sendPushPreference(kind: PushNotificationKind, isEnabled: boolean): Promise<void> {
	const response = await apiClient().api.users.me["push-preferences"].$post({ json: { kind, isEnabled } })
	if (!response.ok) {
		throw new Error(`push preference update failed: ${response.status}`)
	}
}
