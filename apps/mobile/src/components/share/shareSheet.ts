// the operating system's share sheet for one url and its title
import { showClientError } from "@carlnotes/client/apiClient"
import { Platform, Share } from "react-native"

/**
 * Opens the operating system's share sheet with a url and its title, and shows an error if the sheet does not open.
 */
export async function openShareSheet({ title, url }: { title: string; url: string }): Promise<void> {
	try {
		await Share.share(Platform.OS === "ios" ? { title, url } : { title, message: url })
	} catch {
		showClientError("That link didn't open. Carl suggests trying again.")
	}
}
