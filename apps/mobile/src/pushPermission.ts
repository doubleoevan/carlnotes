// the phone's notification permission: reading it, asking for it with the badge, the Android channels each kind of
// push posts to, and the in-context sheet that explains the notifications before the system asks. a grant that lets
// iOS show no alert counts as refused

import { PUSH_CHANNEL_IDS } from "@carlnotes/contracts/pushDevices"
import type { PushPermission } from "@carlnotes/core/components/NotificationsSection"
import { CHAT_MENTION_PUSH_LABEL, TOPIC_PUSH_LABEL } from "@carlnotes/core/lib/pushCopy"
import { toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import * as Notifications from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import { useEffect } from "react"
import { AppState, Platform } from "react-native"
import { toPushPermission } from "./pushRules"

// the channel each kind posts to, with the name the system settings show for it
const PUSH_CHANNELS = [
	{ id: PUSH_CHANNEL_IDS["topic-scan"], name: TOPIC_PUSH_LABEL },
	{ id: PUSH_CHANNEL_IDS["chat-mention"], name: CHAT_MENTION_PUSH_LABEL },
]

// whether this phone already showed the sheet, which shows at most once
const PUSH_PERMISSION_SHEET_SHOWN_KEY = "push-permission-sheet-shown"

// the last permission read, and whether the sheet is open
let pushPermission: PushPermission | null = null
let isPushPermissionSheetOpen = false
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Reads the phone's permission and shares it with every screen that shows it.
 */
export async function readPushPermission(): Promise<PushPermission> {
	pushPermission = toPushPermission(await Notifications.getPermissionsAsync(), Platform.OS)
	publish()
	return pushPermission
}

/**
 * Asks the system for alerts, sounds, and the badge. It makes Android's channels first. Android shows no prompt before a
 * channel exists.
 */
export async function askForPushPermission(): Promise<PushPermission> {
	// the channels, then the system prompt
	if (Platform.OS === "android") {
		for (const pushChannel of PUSH_CHANNELS) {
			await Notifications.setNotificationChannelAsync(pushChannel.id, {
				name: pushChannel.name,
				importance: Notifications.AndroidImportance.DEFAULT,
			})
		}
	}
	const permissions = await Notifications.requestPermissionsAsync({
		ios: { allowAlert: true, allowSound: true, allowBadge: true },
	})

	// share the permission read
	pushPermission = toPushPermission(permissions, Platform.OS)
	publish()
	return pushPermission
}

/**
 * Opens the sheet that explains the notifications, after a first follow or room visit, if the phone was never asked
 * and never showed the sheet.
 */
export async function offerPushPermission(): Promise<void> {
	// only a phone that was never asked, and only once
	const [currentPushPermission, pushPermissionSheetShownValue] = await Promise.all([
		readPushPermission(),
		SecureStore.getItemAsync(PUSH_PERMISSION_SHEET_SHOWN_KEY),
	])
	if (currentPushPermission !== "undetermined" || pushPermissionSheetShownValue || isPushPermissionSheetOpen) {
		return
	}
	isPushPermissionSheetOpen = true
	publish()
}

/**
 * Closes the sheet, remembering that it showed, and asks the system if the user chose to turn notifications on.
 */
export async function closePushPermissionSheet(isAccepted: boolean): Promise<void> {
	isPushPermissionSheetOpen = false
	publish()
	await SecureStore.setItemAsync(PUSH_PERMISSION_SHEET_SHOWN_KEY, "true")
	if (isAccepted) {
		await askForPushPermission()
	}
}

/**
 * Returns whether the permission sheet is open.
 */
export function useIsPushPermissionSheetOpen(): boolean {
	useStoreVersion()
	return isPushPermissionSheetOpen
}

/**
 * Returns the phone's permission, read again each time the app returns to the foreground, as it does from the system
 * settings. Null until the first read.
 */
export function usePushPermission(): PushPermission | null {
	useStoreVersion()
	useEffect(() => {
		// read now, and again on each return to the foreground
		void readPushPermission()
		const subscription = AppState.addEventListener("change", (appState) => {
			if (appState === "active") {
				void readPushPermission()
			}
		})
		return () => subscription.remove()
	}, [])

	// the last read, shared by every screen
	return pushPermission
}
