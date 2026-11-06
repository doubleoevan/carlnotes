// the topic draft tools: creating a topic from a draft, and suggesting sources for one

import { DEFAULT_SOURCES } from "@carlnotes/contracts/sources"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { incrementDaySuggestionCount } from "@carlnotes/db/quotas"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { type SuggestedSource, suggestSources } from "@carlnotes/pipeline/suggest"
import type { AnalyticsProperties } from "../currentUser"
import type { PromptVersionOrigin } from "../topic/promptVersions"
import type { NewTopicSource } from "../topic/saveHelpers"
import { createTopic } from "../topic/saveTopic"
import type { TopicDraftConfirmationRecord } from "../topic/topicDraftConfirmationRecords"
import { isSameTopicSource, toNewTopicSource } from "./topicSourceTools"

// what creating a topic from a draft returns: the editor's own rejections, plus a draft not ready to save
export type CreateTopicFromDraftResult =
	| { status: "forbidden" }
	| { status: "incomplete" }
	| { status: "invalid"; value: string }
	| { status: "limit"; limit: number }
	| { status: "created"; topicId: string; name: string; teamName: string | null; addTeamRejection: string | null }
	| Exclude<Awaited<ReturnType<typeof createTopic>>, { status: "created" }>

/**
 * Creates a topic from a draft through the editor's own create path, with the editor's defaults for everything the
 * draft leaves out.
 */
export async function createTopicFromDraft({
	userId,
	topicDraft,
	origin,
	analyticsProperties,
	confirmationRecord,
}: {
	userId: string | null
	topicDraft: TopicDraft
	origin: PromptVersionOrigin
	analyticsProperties: AnalyticsProperties
	confirmationRecord?: TopicDraftConfirmationRecord
}): Promise<CreateTopicFromDraftResult> {
	// reject a visitor, and a draft with no name or prompt yet
	if (!userId) {
		return { status: "forbidden" }
	}
	if (!topicDraft.name || !topicDraft.prompt) {
		return { status: "incomplete" }
	}

	// build each of the draft's sources through the registry, and reject the first value it cannot use
	const pendingTopicSources: NewTopicSource[] = []
	for (const { sourceOption, value } of topicDraft.sources) {
		const pendingTopicSource = toNewTopicSource(sourceOption, value)
		if (!pendingTopicSource) {
			return { status: "invalid", value: value || sourceOption }
		}
		pendingTopicSources.push(pendingTopicSource)
	}

	// the default sources first, as the editor starts a topic, and a default the draft names is not added twice
	const defaultTopicSources: NewTopicSource[] = DEFAULT_SOURCES.map((defaultTopicSource) => ({
		sourceKind: defaultTopicSource.sourceKind,
		config: defaultTopicSource.toConfig(),
	}))
	const nonDefaultTopicSources = pendingTopicSources.filter(
		(pendingTopicSource) =>
			!defaultTopicSources.some((defaultTopicSource) =>
				isSameTopicSource(
					{ kind: defaultTopicSource.sourceKind, config: defaultTopicSource.config },
					pendingTopicSource,
				),
			),
	)

	// the defaults and the draft's own together may not pass the source limit
	const topicSources = [...defaultTopicSources, ...nonDefaultTopicSources]
	if (topicSources.length > MAX_TOPIC_SOURCES) {
		return { status: "limit", limit: MAX_TOPIC_SOURCES }
	}

	// create the topic through the editor's path, with its gate, its invitee check, its first version, and its first scan
	const createTopicResult = await createTopic(
		userId,
		{
			name: topicDraft.name,
			prompt: topicDraft.prompt,
			tags: topicDraft.tags,
			frequency: topicDraft.frequency,
			scheduledTime: topicDraft.scheduledTime,
			scheduledDayOfWeek: topicDraft.scheduledDayOfWeek,
			visibility: topicDraft.visibility,
			maxTopicFindings: topicDraft.maxTopicFindings,
			isPodcastEnabled: topicDraft.isPodcastEnabled,
			draftTeamId: topicDraft.team?.teamId,
			inviteEmails: topicDraft.inviteEmails,
			sources: topicSources,
		},
		analyticsProperties,
		origin,
		confirmationRecord,
	)
	if (createTopicResult.status !== "created") {
		return createTopicResult
	}
	return {
		status: "created",
		topicId: createTopicResult.id,
		name: topicDraft.name,
		teamName: createTopicResult.team?.teamName ?? null,
		addTeamRejection: createTopicResult.team?.addTeamRejection ?? null,
	}
}

// what suggesting sources for a draft returns
export type SuggestTopicDraftSourcesResult =
	| { status: "forbidden" }
	| { status: "limit" }
	| { status: "ok"; sources: SuggestedSource[] }

/**
 * Suggests sources for a draft the way the editor's Recommend button does, under the same daily limit and on the
 * user's own key.
 */
export async function suggestTopicDraftSources({
	userId,
	name,
	prompt,
}: {
	userId: string | null
	name: string
	prompt: string
}): Promise<SuggestTopicDraftSourcesResult> {
	if (!userId) {
		return { status: "forbidden" }
	}
	// the model call bills to the user's own LiteLLM key, created first if the user has none
	const litellmApiKey = await loadOrProvisionUserLiteLLMKey(userId)

	// draw on the daily suggestion limit
	if (!(await incrementDaySuggestionCount(userId))) {
		return { status: "limit" }
	}

	// suggest sources from the topic draft's name and prompt
	const suggestedSources = await suggestSources({
		name,
		prompt,
		attachmentContext: "",
		excludeSources: [],
		limit: MAX_TOPIC_SOURCES,
		litellmApiKey,
	})
	return { status: "ok", sources: suggestedSources }
}
