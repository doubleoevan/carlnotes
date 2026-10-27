import { showClientError } from "@carlnotes/client/apiClient"
import { AccessibilityInfo } from "react-native"

/**
 * Copies text and announces the result through native accessibility feedback.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		const clipboard = await import("expo-clipboard")
		await clipboard.setStringAsync(text)
		AccessibilityInfo.announceForAccessibility("Copied")
		return true
	} catch {
		showClientError("That didn't copy. Try again.")
		return false
	}
}
