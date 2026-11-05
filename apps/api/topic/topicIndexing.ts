import { toTopicPath } from "@carlnotes/contracts/seo"
import type { topics } from "@carlnotes/db/schema/topics"
import { notifyIndexNow } from "@carlnotes/pipeline/indexNow"
import { saveTopicVectors } from "@carlnotes/pipeline/meanVectors"
import { appUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"

/**
 * Tells IndexNow the urls a save changed: a topic's url if it turns public, its old url if it stops being public,
 * and both if a rename moves a public topic.
 */
export function notifyIndexNowOfTopicChange({
	savedTopic,
	previousTopic,
}: {
	savedTopic: { id: string; name: string; visibility: (typeof topics.$inferSelect)["visibility"] }
	previousTopic: { name: string; visibility: (typeof topics.$inferSelect)["visibility"] } | null
}): void {
	// the topic's indexed path after the save and before it. only a public topic's page is indexed
	const topicPath = savedTopic.visibility === "public" ? toTopicPath(savedTopic) : null
	const previousTopicPath =
		previousTopic?.visibility === "public" ? toTopicPath({ id: savedTopic.id, name: previousTopic.name }) : null
	if (topicPath === previousTopicPath) {
		return
	}
	// send the path that appeared and the path that went away
	const changedPaths = [topicPath, previousTopicPath].filter((changedPath) => changedPath !== null)
	void notifyIndexNow(changedPaths.map((changedPath) => `${appUrl()}${changedPath}`))
}

// the saved topic, and its visibility before and after the save
type SaveTopicVectorsOnVisibilityChangeOptions = {
	topicId: string
	visibility: (typeof topics.$inferSelect)["visibility"]
	previousVisibility: (typeof topics.$inferSelect)["visibility"]
}

/**
 * Saves a topic's vectors again if a save changed its visibility. A failed save is reported and never fails the topic's
 * save.
 */
export async function saveTopicVectorsOnVisibilityChange({
	topicId,
	visibility,
	previousVisibility,
}: SaveTopicVectorsOnVisibilityChangeOptions): Promise<void> {
	if (visibility === previousVisibility) {
		return
	}
	await saveTopicVectorsReportingFailure(topicId)
}

/**
 * Saves a topic's vectors again, reporting a failed save instead of throwing it.
 */
export async function saveTopicVectorsReportingFailure(topicId: string): Promise<void> {
	await saveTopicVectors(topicId).catch((error: unknown) => reportError(error, "database", { topicId }))
}
