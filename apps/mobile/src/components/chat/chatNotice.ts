// the app's chat notice in place of the web's toast: an alert under the chat's name, with an action button beside OK
// if one is given
import { CHAT_NAME } from "@carlnotes/contracts/chat"
import type { VoiceNoticeAction } from "@carlnotes/core/lib/voiceRecorder"
import { Alert } from "react-native"

/**
 * Shows a chat notice, with the action's button beside OK if one is given.
 */
export function showChatNotice(message: string, action?: VoiceNoticeAction): void {
	const buttons = action
		? [
				{ text: "OK", style: "cancel" as const },
				{ text: action.label, onPress: action.onPress },
			]
		: undefined
	Alert.alert(CHAT_NAME, message, buttons)
}
