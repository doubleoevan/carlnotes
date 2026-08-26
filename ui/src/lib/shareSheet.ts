// the operating system's share sheet, the only way to reach messaging applications that publish no share url of their own.

// how the sheet ended. dismissed is a decision the person made, unavailable is the browser refusing
export type ShareSheetResult = "shared" | "dismissed" | "unavailable"

/**
 * Whether this browser can open a share sheet worth offering. Read at render, so no control is shown that cannot fire.
 * The coarse pointer keeps it to mobile, where the sheet lists the messaging applications this exists for.
 */
export function canOpenShareSheet(): boolean {
	return typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches
}

/**
 * Open the share sheet with a title, a text, and a url.
 *
 * The sheet returns nothing about where the person sent it. The promise resolves identically whichever
 * application they select, with no destination and no recipient, so nothing may be attributed from it.
 */
export async function openShareSheet(share: { title: string; text: string; url: string }): Promise<ShareSheetResult> {
	// a browser without the api returns the same as one that refuses, so a caller needs one fallback
	if (typeof navigator.share !== "function") {
		return "unavailable"
	}

	try {
		await navigator.share(share)
		return "shared"
	} catch (error) {
		// dismissing the sheet is a completed interaction, and the browser refusing the gesture is not
		return error instanceof Error && error.name === "AbortError" ? "dismissed" : "unavailable"
	}
}
