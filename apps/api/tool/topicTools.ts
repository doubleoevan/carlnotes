// the topic prompt and settings tools, each asking the gate itself, and the gate the source and draft tools share

import {
	topicSettingsShape,
	type UpdateTopicFieldsPayload,
	updateTopicFieldsPayload,
} from "@carlnotes/contracts/topicPayloads"
import { db } from "@carlnotes/db"
import { assertPersonalSourcesConverted, lockPersonalSourcesTopic } from "@carlnotes/db/personalSourcesLocks"
import { deletePodcastFeedCache } from "@carlnotes/db/podcastFeedCache"
import { releaseTopicProfileOrders } from "@carlnotes/db/profileOrder"
import { topics } from "@carlnotes/db/schema/topics"
import { clearUnseenCommentMentions, loadTopicMentionedUserIds } from "@carlnotes/db/unseenCommentMentions"
import { rebuildTopicDashboards } from "@carlnotes/pipeline/dashboardRebuild"
import {
	redrawUnpublishedImageFiles,
	unpublishTopicUncheckedImages,
} from "@carlnotes/pipeline/publishedUncheckedImages"
import type { UncheckedImageHashSubject } from "@carlnotes/pipeline/uncheckedImages"
import { trackEvent } from "@carlnotes/server/analytics"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { eq } from "drizzle-orm"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { addTopicToDefaultTeamOnVisibilityChange } from "../team/defaultTeam"
import { clearVisitorTopicCaches } from "../topic/feedCaches"
import { releaseHomeOrder } from "../topic/homeOrder"
import { type PromptVersionOrigin, savePromptVersion } from "../topic/promptVersions"
import { authorizeNewDailyTopic, type DailyFrequencyRejection } from "../topic/saveHelpers"
import { notifyIndexNowOfTopicChange, saveTopicVectorsOnVisibilityChange } from "../topic/saveTopic"

// a tool's result when the gate rejects. a topic the user cannot see is missing, one they may not edit is forbidden
export type TopicToolRejection = { status: "missing" } | { status: "forbidden" }

// each tool's results
export type UpdateTopicPromptResult = TopicToolRejection | { status: "saved"; topicName: string }
// the settings tool's results for the gate's rejections, the plan's daily limit, or the save
export type UpdateTopicFieldsResult =
	| TopicToolRejection
	| DailyFrequencyRejection
	| { status: "empty" }
	| { status: "saved"; topicName: string; defaultTeamName: string | null }

/**
 * Saves a new prompt and its version in one transaction, when the gate grants the user topic:edit.
 */
export async function updateTopicPrompt({
	userId,
	topicId,
	prompt,
	origin,
	analyticsProperties,
}: {
	userId: string | null
	topicId: string
	prompt: string
	origin: PromptVersionOrigin
	analyticsProperties?: AnalyticsProperties
}): Promise<UpdateTopicPromptResult> {
	// ask the gate whether the user may edit the topic
	const editableTopic = await loadEditableTopic(userId, topicId)
	if (editableTopic.status !== "ok") {
		return editableTopic
	}

	// write the prompt and its version in one transaction
	await db.transaction(async (transaction) => {
		await transaction.update(topics).set({ prompt }).where(eq(topics.id, topicId))
		await savePromptVersion(transaction, {
			topicId,
			prompt,
			userId: editableTopic.userId,
			origin,
			previousPrompt: editableTopic.topic.prompt,
		})
	})

	// drop the topic's cached visitor copies
	await clearVisitorTopicCaches({ topicId, visibility: editableTopic.topic.visibility })
	trackEvent("topic_edited", editableTopic.userId, {
		...toToolAnalyticsProperties(origin, analyticsProperties),
		topicId,
		tool: "updateTopicPrompt",
		origin,
	})
	return { status: "saved", topicName: editableTopic.topic.name }
}

/**
 * Returns a tool call's analytics properties: the request's if a request passed them, else the entry point its
 * origin names.
 */
export function toToolAnalyticsProperties(
	origin: PromptVersionOrigin,
	analyticsProperties: AnalyticsProperties | undefined,
): Partial<AnalyticsProperties> {
	return analyticsProperties ?? { entryPoint: origin === "mcp" ? "mcp" : "web" }
}

/**
 * Changes only the topic fields that are named.
 */
export async function updateTopicFields({
	userId,
	topicId,
	topicFields,
	promptVersionOrigin,
	analyticsProperties,
	isDefaultTeamApplied = true,
}: {
	userId: string | null
	topicId: string
	topicFields: UpdateTopicFieldsPayload & { isPodcastCommentsEnabled?: boolean }
	promptVersionOrigin: PromptVersionOrigin
	analyticsProperties?: AnalyticsProperties
	// whether a topic made public or invite goes on its owner's default team if no team holds it
	isDefaultTeamApplied?: boolean
}): Promise<UpdateTopicFieldsResult> {
	// drop the podcast switches if Podcast Episode recording is not configured
	const { isPodcastEnabled, isPodcastCommentsEnabled, ...topicSettings } = topicFields
	const topicFieldsToSave = isPodcastEpisodeRecordingConfigured() ? topicFields : topicSettings

	// a call that names no field has nothing to save, whatever adapter sent it
	const namedFields = Object.fromEntries(Object.entries(topicFieldsToSave).filter(([, value]) => value !== undefined))
	if (Object.keys(namedFields).length === 0) {
		return { status: "empty" }
	}
	// ask the gate whether the user may edit the topic
	const editableTopic = await loadEditableTopic(userId, topicId)
	if (editableTopic.status !== "ok") {
		return editableTopic
	}
	// only the owner turns the podcast's Comments on or off
	if (isPodcastCommentsEnabled !== undefined && editableTopic.topic.ownerId !== editableTopic.userId) {
		return { status: "forbidden" }
	}
	// a move onto a daily frequency takes a slot from the owner who funds its scans
	if (topicFields.frequency) {
		const dailyFrequency = await authorizeNewDailyTopic(
			editableTopic.topic.ownerId,
			{ frequency: topicFields.frequency },
			editableTopic.topic.frequency,
		)
		if (dailyFrequency) {
			return dailyFrequency
		}
	}
	// write the named fields and release the home order in one transaction
	let isHomeOrderReleased = false
	let releasedProfileUserIds: string[] = []
	// the subjects whose unchecked image the visibility change unpublished
	let uncheckedImageSubjects: UncheckedImageHashSubject[] = []
	await db.transaction(async (transaction) => {
		// serialize publication and podcast activation against private confirmation
		await lockPersonalSourcesTopic(transaction, topicId)
		if ((topicFields.visibility && topicFields.visibility !== "private") || topicFields.isPodcastEnabled) {
			await assertPersonalSourcesConverted(transaction, topicId)
		}

		// a private topic that turns invite or public shows no image whose check has not run. the image goes back to
		// its uploader alone before the topic's row is written
		if (topicFields.visibility) {
			const { visibility } = topicFields
			uncheckedImageSubjects = await unpublishTopicUncheckedImages(transaction, { topicId, visibility })
		}
		await transaction.update(topics).set(namedFields).where(eq(topics.id, topicId))
		// drop the topic from the home topics and from its owner's profile pins if it stops being public
		if (topicFields.visibility && topicFields.visibility !== "public") {
			isHomeOrderReleased = await releaseHomeOrder(topicId, transaction)
			releasedProfileUserIds = await releaseTopicProfileOrders(topicId, transaction)
		}
	})

	// draw again what was drawn from an image that went back to its uploader
	await redrawUnpublishedImageFiles(topicId, uncheckedImageSubjects)

	// a private topic made public or invite goes on its owner's default team, unless a team already holds it
	const defaultTeamName = await addTopicToDefaultTeamOnVisibilityChange({
		ownerId: editableTopic.topic.ownerId,
		topicId,
		previousVisibility: editableTopic.topic.visibility,
		visibility: topicFields.visibility,
		isDefaultTeamApplied,
	})

	// the topic as saved, and drop its cached visitor copies
	const savedTopic = {
		id: topicId,
		name: topicFields.name ?? editableTopic.topic.name,
		visibility: topicFields.visibility ?? editableTopic.topic.visibility,
	}
	await clearVisitorTopicCaches({
		topicId,
		visibility: savedTopic.visibility,
		previousVisibility: editableTopic.topic.visibility,
		isHomeOrderReleased,
		releasedProfileUserIds,
	})

	// a changed visibility changes who may read the topic's comments and see it on a Dashboard, so clear the cached
	// mentions of its mentioned users and rebuild its Dashboards
	if (savedTopic.visibility !== editableTopic.topic.visibility) {
		await clearUnseenCommentMentions(await loadTopicMentionedUserIds(topicId))
		await rebuildTopicDashboards(editableTopic.topic)
	}

	// tell IndexNow if the edit made the topic public or changed its url
	notifyIndexNowOfTopicChange({ savedTopic, previousTopic: editableTopic.topic })

	// save the topic's vectors again if the edit changed its visibility
	await saveTopicVectorsOnVisibilityChange({
		topicId,
		visibility: savedTopic.visibility,
		previousVisibility: editableTopic.topic.visibility,
	})

	// delete the topic's cached podcast feeds if the name changed. a feed's show cover url changes with the name
	if (savedTopic.name !== editableTopic.topic.name) {
		await deletePodcastFeedCache(topicId)
	}

	// report the edit, and the podcast switch if it flipped, then return the saved name
	const toolAnalyticsProperties = { ...toToolAnalyticsProperties(promptVersionOrigin, analyticsProperties), topicId }
	trackEvent("topic_edited", editableTopic.userId, {
		...toolAnalyticsProperties,
		tool: "updateTopicFields",
		origin: promptVersionOrigin,
	})
	if (isPodcastEnabled !== undefined && isPodcastEnabled !== editableTopic.topic.isPodcastEnabled) {
		trackEvent("podcast_toggled", editableTopic.userId, { ...toolAnalyticsProperties, isEnabled: isPodcastEnabled })
	}
	return { status: "saved", topicName: savedTopic.name, defaultTeamName }
}

/**
 * Returns the settings tool's input fields, without the podcast switch if episode recording is not configured.
 */
export function toUpdateTopicFieldsShape(): typeof updateTopicFieldsPayload.shape {
	return isPodcastEpisodeRecordingConfigured()
		? updateTopicFieldsPayload.shape
		: (topicSettingsShape as typeof updateTopicFieldsPayload.shape)
}

/**
 * Returns the settings tool's podcast switch sentence, or an empty string if episode recording is not configured.
 */
export function toPodcastFieldDescription(): string {
	return isPodcastEpisodeRecordingConfigured()
		? " Set isPodcastEnabled to turn the topic's Coffee Break podcast on or off."
		: ""
}

/**
 * Returns the topic if the user may edit it, else the gate's rejection.
 */
export async function loadEditableTopic(
	userId: string | null,
	topicId: string,
): Promise<{ status: "ok"; topic: typeof topics.$inferSelect; userId: string } | TopicToolRejection> {
	// load the topic, and return missing when the user cannot see it
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:view", topic))) {
		return { status: "missing" }
	}
	// reject a visitor or a user without edit rights
	if (!userId || !(await isAllowed(userId, "topic:edit", topic))) {
		return { status: "forbidden" }
	}
	return { status: "ok", topic, userId }
}
