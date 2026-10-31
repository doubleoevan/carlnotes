// the microphone permission that a first mic tap asks for: granted, denied, or denied for good, which only the phone's
// settings can undo, and the "Open settings" action that a denial for good offers
import { OPEN_SETTINGS_LABEL } from "@carlnotes/core/lib/pushCopy"
import type { VoiceNoticeAction } from "@carlnotes/core/lib/voiceRecorder"
import type { PermissionResponse } from "expo-audio"

// what the microphone request returns
export type MicrophonePermission = "granted" | "denied" | "deniedForGood"

// the phone's permission reads, which the app passes in from expo-audio
export type MicrophonePermissionReads = {
	getPermission: () => Promise<Pick<PermissionResponse, "granted" | "canAskAgain">>
	requestPermission: () => Promise<Pick<PermissionResponse, "granted" | "canAskAgain">>
}

/**
 * The error that a recording throws if the microphone is denied, naming whether only the settings can undo it.
 */
export class MicrophoneRejectedError extends Error {
	constructor(readonly microphonePermission: Exclude<MicrophonePermission, "granted">) {
		super("microphone denied")
	}
}

/**
 * Returns what a permission response means: granted, denied with another ask possible, or denied for good.
 */
export function toMicrophonePermission({
	granted,
	canAskAgain,
}: Pick<PermissionResponse, "granted" | "canAskAgain">): MicrophonePermission {
	if (granted) {
		return "granted"
	}
	return canAskAgain ? "denied" : "deniedForGood"
}

/**
 * Asks for the microphone on the first tap: a granted permission returns at once, a denial for good never asks
 * again, and every other state shows the system prompt.
 */
export async function requestMicrophonePermission({
	getPermission,
	requestPermission,
}: MicrophonePermissionReads): Promise<MicrophonePermission> {
	// the permission as it stands, which a granted or a denied-for-good one settles
	const currentPermission = toMicrophonePermission(await getPermission())
	if (currentPermission !== "denied") {
		return currentPermission
	}

	// the system prompt, the first time or again after a denial that the phone lets the app ask past
	return toMicrophonePermission(await requestPermission())
}

/**
 * Returns the action that a denied microphone's notice offers: "Open settings" for a denial that only the settings can
 * undo, and none otherwise.
 */
export function toMicrophoneRejectedAction(error: unknown, openSettings: () => void): VoiceNoticeAction | undefined {
	if (error instanceof MicrophoneRejectedError && error.microphonePermission === "deniedForGood") {
		return { label: OPEN_SETTINGS_LABEL, onPress: openSettings }
	}
	return undefined
}
