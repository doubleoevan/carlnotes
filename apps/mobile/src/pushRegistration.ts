// the phone's push token on the api: registered for the signed-in session once notification permission is granted,
// again on each later sign-in and token change, and unregistered before a sign-out. a failed registration is logged
// and never shown

import { sendDeletePushDevice, sendPushDevice } from "@carlnotes/client/pushClient"
import Constants from "expo-constants"
import * as Notifications from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import { deviceTelemetry, MOBILE_PLATFORM } from "./deviceTelemetry"
import { toPushDevicePayload } from "./pushRules"

// the token this phone last registered, kept so a changed token removes its old row
const PUSH_TOKEN_KEY = "push-token"

/**
 * Registers the phone's current push token for the signed-in session, and remembers it. Returns whether the
 * registration reached the api.
 */
export async function registerPushDevice(): Promise<boolean> {
	try {
		// the Expo token for this build's EAS project, and the one registered before
		const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
		const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId })
		const previousExpoPushToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY)

		// bind the token to this session, then keep it as the one registered
		await sendPushDevice(
			toPushDevicePayload({
				expoPushToken,
				previousExpoPushToken,
				platform: MOBILE_PLATFORM,
				appVersion: deviceTelemetry.appVersion,
			}),
		)
		await SecureStore.setItemAsync(PUSH_TOKEN_KEY, expoPushToken)
		return true
	} catch (error) {
		console.error("push registration failed", error)
		return false
	}
}

/**
 * Unregisters the phone's push token from the signed-in session and forgets it on the phone. A failed request is logged
 * and ignored.
 */
export async function unregisterPushDevice(): Promise<void> {
	try {
		// the token this phone registered, if it ever did
		const expoPushToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY)
		if (expoPushToken) {
			await sendDeletePushDevice(expoPushToken)
		}
	} catch (error) {
		console.error("push unregister failed", error)
	}

	// forget the token on the phone
	await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch((error) => console.error("push token clear failed", error))
}
