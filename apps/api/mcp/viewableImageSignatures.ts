// the signatures a tool result's gated image paths take: a path is signed only if its topic is not public and the
// caller may view it now, so a path that reaches a result through text someone wrote opens nothing new

import { db } from "@carlnotes/db"
import { isAllowed } from "@carlnotes/db/authorization"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { gatedTopicColumns } from "@carlnotes/db/topicPermissions"
import { inArray } from "drizzle-orm"
import { type GatedImageSubject, toGatedImageSubjects, toSignedGatedImagePaths } from "../signedImagePaths"

/**
 * Returns a tool result with the gated image paths of the caller's viewable non-public topics signed. A public topic's
 * path needs no signature, and a caller with no account views no non-public topic, so either returns as it is.
 */
export async function toResultWithViewableImagesSigned<Result>(result: Result, userId: string | null): Promise<Result> {
	// the subjects the result's gated image paths name
	const subjects = toGatedImageSubjects(result)
	if (!userId || subjects.length === 0) {
		return result
	}

	// each subject's topic, then the non-public topics among them that the caller may view
	const topicIdsBySubject = await loadSubjectTopicIds(subjects)
	const viewableTopicIds = await loadViewableNonPublicTopicIds(userId, [...new Set(topicIdsBySubject.values())])
	return toSignedGatedImagePaths({
		value: result,
		isSubjectSigned: (subject) => viewableTopicIds.has(topicIdsBySubject.get(toSubjectKey(subject)) ?? ""),
	})
}

// each subject's topic id by its subject key: a topic is its own, and a podcast episode's and a Topic Post's are read
// in one query per kind. a subject with no topic is left out
async function loadSubjectTopicIds(subjects: GatedImageSubject[]): Promise<Map<string, string>> {
	// the ids of each kind
	const idsOfKind = (kind: GatedImageSubject["kind"]): string[] => [
		...new Set(subjects.filter((subject) => subject.kind === kind).map((subject) => subject.id)),
	]
	const podcastEpisodeIds = idsOfKind("podcastEpisode")
	const topicPostIds = idsOfKind("topicPost")

	// the podcast episodes' and the Topic Posts' topics
	const [podcastEpisodeRows, topicPostRows] = await Promise.all([
		podcastEpisodeIds.length > 0
			? db
					.select({ id: podcastEpisodes.id, topicId: podcastEpisodes.topicId })
					.from(podcastEpisodes)
					.where(inArray(podcastEpisodes.id, podcastEpisodeIds))
			: [],
		topicPostIds.length > 0
			? db
					.select({ id: topicPosts.id, topicId: topicPosts.topicId })
					.from(topicPosts)
					.where(inArray(topicPosts.id, topicPostIds))
			: [],
	])

	// every subject's topic id under its key
	return new Map([
		...idsOfKind("topic").map((topicId): [string, string] => [toSubjectKey({ kind: "topic", id: topicId }), topicId]),
		...podcastEpisodeRows.flatMap(({ id, topicId }): [string, string][] =>
			topicId ? [[toSubjectKey({ kind: "podcastEpisode", id }), topicId]] : [],
		),
		...topicPostRows.map(({ id, topicId }): [string, string] => [toSubjectKey({ kind: "topicPost", id }), topicId]),
	])
}

// the ids of the topics that are not public and that the caller may view now
async function loadViewableNonPublicTopicIds(userId: string, topicIds: string[]): Promise<Set<string>> {
	if (topicIds.length === 0) {
		return new Set()
	}

	// the non-public topics, each checked by the view gate
	const topicRows = await db.select(gatedTopicColumns).from(topics).where(inArray(topics.id, topicIds))
	const nonPublicTopicRows = topicRows.filter((topicRow) => topicRow.visibility !== "public")
	const viewChecks = await Promise.all(
		nonPublicTopicRows.map(async (topicRow) => ({
			topicId: topicRow.id,
			isViewable: await isAllowed(userId, "topic:view", topicRow),
		})),
	)
	return new Set(viewChecks.filter((viewCheck) => viewCheck.isViewable).map((viewCheck) => viewCheck.topicId))
}

// one key for a subject, its kind and its id
function toSubjectKey({ kind, id }: GatedImageSubject): string {
	return `${kind}:${id}`
}
