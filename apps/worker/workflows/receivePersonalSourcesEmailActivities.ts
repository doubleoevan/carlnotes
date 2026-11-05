// provider errors never enter Temporal history with private request or response content
import { processPersonalSourcesEmail } from "@carlnotes/pipeline/personalSources/email"
import { ApplicationFailure } from "@temporalio/activity"

/**
 * Processes one receipt without returning mail content or raw provider errors.
 */
export async function receivePersonalSourcesEmailAttempt(receiptId: string): Promise<{ retryAfterMs: number | null }> {
	try {
		return await processPersonalSourcesEmail(receiptId)
	} catch {
		throw ApplicationFailure.retryable(
			"Personal sources email processing is temporarily unavailable",
			"PersonalSourcesEmailUnavailable",
		)
	}
}
