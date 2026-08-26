// the flag-content call, for a Topic or a profile
import type { FlagContentPayload } from "@shared/contracts"

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
		const body = (await response.json().catch(() => null)) as { error?: string } | null
		throw new Error(typeof body?.error === "string" ? body.error : `flag failed: ${response.status}`)
	}
}
