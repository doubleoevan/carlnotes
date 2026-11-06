// provider errors never enter Temporal history with private request or response content
import { processPersonalSourcesEmail } from "@carlnotes/pipeline/personalSources/email"
import { ApplicationFailure } from "@temporalio/activity"

/**
 * Processes one confirmation without returning mail content or raw provider errors.
 */
export async function receivePersonalSourcesEmailAttempt(
	confirmationId: string,
): Promise<{ retryAfterMs: number | null }> {
	try {
		return await processPersonalSourcesEmail(confirmationId)
	} catch {
		throw ApplicationFailure.retryable(
			"Personal sources email processing is temporarily unavailable",
			"PersonalSourcesEmailUnavailable",
		)
	}
}
