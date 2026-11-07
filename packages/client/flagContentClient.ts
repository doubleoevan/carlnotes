// the flag-content call, for a Topic or a profile
import type { FlagContentPayload, ReportedSubjectQuery } from "@carlnotes/contracts/payloads"
import { reportedSubjectResponse } from "@carlnotes/contracts/reports"
import { apiClient, fetchApi, readApiErrorMessage } from "./apiClient"

/**
 * Reads whether the signed-in user reported a subject. Throws an error on a rejection.
 */
export async function fetchIsSubjectReported(query: ReportedSubjectQuery): Promise<boolean> {
	const response = await apiClient().api["flag-content"].$get({ query })
	if (!response.ok) {
		throw new Error(`reported subject failed: ${response.status}`)
	}
	return reportedSubjectResponse.parse(await response.json()).isReported
}

/**
 * Removes the signed-in user's report of a subject. Throws an error on a rejection.
 */
export async function sendReportRemoval(query: ReportedSubjectQuery): Promise<void> {
	const response = await apiClient().api["flag-content"].$delete({ query })
	if (!response.ok) {
		throw new Error(`report removal failed: ${response.status}`)
	}
}

/**
 * Flag a Topic or profile. Throws an error with the api's reason on a rejection.
 */
export async function sendFlagContent(payload: FlagContentPayload): Promise<void> {
	const response = await fetchApi("/api/flag-content", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	})
	if (!response.ok) {
		throw new Error((await readApiErrorMessage(response)) ?? `flag failed: ${response.status}`)
	}
}
