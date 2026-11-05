// private text stays inside activity memory and encrypted storage, never workflow arguments or results
import type { PersonalSourcesWork } from "@carlnotes/contracts/personalSourcesWork"
import { loadPersonalSourcesWork } from "@carlnotes/db/personalSourcesWork"
import { summarizePersonalSourcesContext } from "@carlnotes/pipeline/personalSources/summarize"
import { ApplicationFailure } from "@temporalio/activity"

/**
 * Loads the current revision and deadlines for one Topic's durable workflow.
 */
export async function readPersonalSourcesWork(topicId: string): Promise<PersonalSourcesWork | null> {
	return loadPersonalSourcesWork(topicId)
}

/**
 * Rebuilds one revision without serializing provider errors or private content into workflow history.
 */
export async function rebuildPersonalSourcesContext(
	topicId: string,
): Promise<Awaited<ReturnType<typeof summarizePersonalSourcesContext>>> {
	try {
		return await summarizePersonalSourcesContext(topicId)
	} catch {
		throw ApplicationFailure.retryable(
			"Personal sources context processing is temporarily unavailable",
			"PersonalSourcesContextUnavailable",
		)
	}
}
