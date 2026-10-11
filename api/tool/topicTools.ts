// the topic prompt and settings tools, each asking the gate itself, and the gate the source and draft tools share
import { trackEvent } from "@shared/analytics"
import { isPodcastEpisodeRecordingConfigured } from "@shared/podcastEpisodes"
import { topicSettingsShape, type UpdateTopicFieldsPayload, updateTopicFieldsPayload } from "@shared/topicPayloads"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { deletePodcastFeedCache } from "../../db/podcastFeedCache"
import { topics } from "../../db/schema/topics"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { releaseFeatureOrder } from "../topic/featuring"
import { clearVisitorTopicCaches } from "../topic/feeds"
import { type PromptVersionOrigin, savePromptVersion } from "../topic/promptVersions"
import { authorizeNewDailyTopic, type DailyFrequencyRejection } from "../topic/saveHelpers"
import { notifyIndexNowOfTopicChange } from "../topic/saveTopic"

// a tool's result when the gate rejects. a topic the user cannot see is missing, one they may not edit is forbidden
export type TopicToolRejection = { status: "missing" } | { status: "forbidden" }

// each tool's results
export type UpdateTopicPromptResult = TopicToolRejection | { status: "saved"; topicName: string }
// the settings tool's results for the gate's rejections, the plan's daily limit, or the save
export type UpdateTopicFieldsResult =
	| TopicToolRejection
	| DailyFrequencyRejection
	| { status: "empty" }
	| { status: "saved"; topicName: string }

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

	// drop the visitors' cached topic page, and the visitors' feeds if the topic is public
	await clearVisitorTopicCaches({ topicId, isListingChanged: editableTopic.topic.visibility === "public" })
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
}: {
	userId: string | null
	topicId: string
	topicFields: UpdateTopicFieldsPayload
	promptVersionOrigin: PromptVersionOrigin
	analyticsProperties?: AnalyticsProperties
}): Promise<UpdateTopicFieldsResult> {
	// drop the podcast switch if episode recording is not configured
	const { isPodcastEnabled, ...topicSettings } = topicFields
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
	// write the named fields and release the feature order in one transaction
	let isFeatureOrderReleased = false
	await db.transaction(async (transaction) => {
		await transaction.update(topics).set(namedFields).where(eq(topics.id, topicId))
		// drop the topic from the featured topics if it stops being public
		if (topicFields.visibility && topicFields.visibility !== "public") {
			isFeatureOrderReleased = await releaseFeatureOrder(topicId, transaction)
		}
	})

	// the topic as saved. drop its cached visitor page, and the visitors' feeds if it was or is now public or the edit
	// released its feature order
	const savedTopic = {
		id: topicId,
		name: topicFields.name ?? editableTopic.topic.name,
		visibility: topicFields.visibility ?? editableTopic.topic.visibility,
	}
	const isPublicBeforeOrAfterEdit = editableTopic.topic.visibility === "public" || savedTopic.visibility === "public"
	await clearVisitorTopicCaches({ topicId, isListingChanged: isFeatureOrderReleased || isPublicBeforeOrAfterEdit })

	// tell IndexNow if the edit made the topic public or changed its url
	notifyIndexNowOfTopicChange({ savedTopic, previousTopic: editableTopic.topic })

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
	return { status: "saved", topicName: savedTopic.name }
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
