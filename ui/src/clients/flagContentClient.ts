// the flag-content call, for a Topic or a profile
import type { FlagContentPayload } from "@shared/payloads"
import { readApiErrorMessage } from "./apiClient"

/**
 * Flag a Topic or profile. Throws an error with the api's reason on a rejection.
 */
export async function sendFlagContent(payload: FlagContentPayload): Promise<void> {
	const response = await fetch("/api/flag-content", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `flag failed: ${response.status}`)
	}
}
