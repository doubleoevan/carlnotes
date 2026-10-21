// the topic draft tools: creating a topic from a draft, and suggesting sources for one

import { DEFAULT_SOURCES } from "@carlnotes/contracts/sources"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { incrementDaySuggestionCount } from "@carlnotes/db/quotas"
import { teams } from "@carlnotes/db/schema/teams"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { type SuggestedSource, suggestSources } from "@carlnotes/pipeline/suggest"
import { eq } from "drizzle-orm"
import type { AnalyticsProperties } from "../currentUser"
import { addTopicToTeam } from "../team/teams"
import type { PromptVersionOrigin } from "../topic/promptVersions"
import type { NewTopicSource } from "../topic/saveHelpers"
import { createTopic } from "../topic/saveTopic"
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
}: {
	userId: string | null
	topicDraft: TopicDraft
	origin: PromptVersionOrigin
	analyticsProperties: AnalyticsProperties
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
			inviteEmails: topicDraft.inviteEmails,
			sources: topicSources,
		},
		analyticsProperties,
		origin,
	)
	if (createTopicResult.status !== "created") {
		return createTopicResult
	}
	// put the topic on the topic draft's team through the leader-only path, and name a rejected add beside the topic
	const addTeamResult = topicDraft.team
		? await toAddTeamResult({ userId, teamId: topicDraft.team.teamId, topicId: createTopicResult.id })
		: null
	return {
		status: "created",
		topicId: createTopicResult.id,
		name: topicDraft.name,
		teamName: addTeamResult?.teamName ?? null,
		addTeamRejection: addTeamResult?.addTeamRejection ?? null,
	}
}

// the words for an add the leader check rejected, or the team's own name once the topic is on it
async function toAddTeamResult({
	userId,
	teamId,
	topicId,
}: {
	userId: string
	teamId: string
	topicId: string
}): Promise<{ teamName: string; addTeamRejection: string | null }> {
	// the add first, so a rejected caller reads no name
	const addTopicToTeamResult = await addTopicToTeam(userId, teamId, topicId)
	if (addTopicToTeamResult === "forbidden") {
		return { teamName: "that team", addTeamRejection: "Only a team's leader can add a topic to it." }
	}
	const [teamRow] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId))
	return { teamName: teamRow?.name ?? "that team", addTeamRejection: null }
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
