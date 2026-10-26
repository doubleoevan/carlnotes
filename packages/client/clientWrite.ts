import { type ApiResponse, showClientError } from "./apiClient"

// a write's reporting and rejection policy
type ShowFailedWriteOptions = {
	request: Promise<ApiResponse>
	action: string
	isBackground?: boolean
	shouldThrowOnError?: boolean
}

/**
 * Reports a rejected write and optionally propagates it to an optimistic caller.
 */
export async function showFailedWrite({
	request,
	action,
	isBackground = false,
	shouldThrowOnError = false,
}: ShowFailedWriteOptions): Promise<void> {
	// a rejected request never reaches a Response at all, so an offline user is told the same as a rejected write
	let response: ApiResponse
	try {
		response = await request
	} catch (error) {
		console.error(`${action} failed to reach the server`, error)
		showRejectedWrite(isBackground)
		if (shouldThrowOnError) {
			throw error
		}
		return
	}

	// the server answered, so only a rejected status is a failure from here
	if (response.ok) {
		return
	}

	// the log includes the detail. the message shown to the user only says the write failed
	console.error(`${action} failed: ${response.status} ${await response.text()}`)
	showRejectedWrite(isBackground)
	if (shouldThrowOnError) {
		throw new Error(`${action} failed: ${response.status}`)
	}
}

// the one message a failed write shows, skipped for a write the user never asked for by itself
function showRejectedWrite(isBackground: boolean): void {
	if (!isBackground) {
		showClientError("That didn't save. Carl suggests trying again.")
	}
}
