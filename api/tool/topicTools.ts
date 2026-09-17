// the topic tools, each asking the gate itself
import { trackEvent } from "@shared/analytics"
import {
	type AddTopicSourcePayload,
	MAX_TOPIC_SOURCES,
	type TopicDraft,
	type UpdateTopicFieldsPayload,
} from "@shared/contracts"
import type { frequencies } from "@shared/enums"
import { SCAN_COST_CENTS } from "@shared/plans"
import { DEFAULT_SOURCES, toCustomSourceOption, toSourceSummary, toSourceValue } from "@shared/sources"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../../db"
import { incrementDaySuggestionCount } from "../../db/quotas"
import { scans, sources, teams, topics, users } from "../../db/schema"
import { type SuggestedSource, suggestSources } from "../../worker"
import { EXA_COST_PER_SEARCH, X_COST_PER_READ } from "../../worker/budget"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { addTopicToTeam } from "../team/teams"
import { releaseFeatureOrder } from "../topic/featuring"
import {
	authorizeNewDailyTopic,
	type DailyFrequencyRejection,
	type NewTopicSource,
	startPendingSourceScreens,
	toNewSourceRow,
	toPodcastNames,
} from "../topic/helpers"
import { type PromptVersionOrigin, savePromptVersion } from "../topic/promptVersions"
import { createTopic } from "../topic/topics"

// how many recent succeeded scans the mean scan cost averages over
const COST_AVERAGE_SCAN_COUNT = 5

// the source count the average scan cost is split across for a topic with no succeeded scans
const FALLBACK_SOURCE_COUNT = 5

// how many scans a month each frequency starts
const SCANS_PER_MONTH: Record<(typeof frequencies)[number], number> = { daily: 30, weekdays: 22, weekly: 4 }

// what a paid kind's ingester spends per scan, in dollars: five search queries, or a hundred x post reads
// ponytail: flat estimates. read the ingesters' own limits if these drift from what the ingestion stage saves
const SEARCH_QUERY_COUNT_PER_SCAN = 5
const X_READ_COUNT_PER_SCAN = 100
const INGESTION_COST_DOLLARS: Partial<Record<string, number>> = {
	search: SEARCH_QUERY_COUNT_PER_SCAN * EXA_COST_PER_SEARCH,
	x: X_READ_COUNT_PER_SCAN * X_COST_PER_READ,
}

// a tool's result when the gate rejects. a topic the user cannot see is missing, one they may not edit is forbidden
export type TopicToolRejection = { status: "missing" } | { status: "forbidden" }

// what one more source is projected to cost, in cents per scan and per month at the topic's frequency
export type TopicSourceCostDelta = { perScanCents: number; perMonthCents: number }

// each tool's results
export type UpdateTopicPromptResult = TopicToolRejection | { status: "saved"; topicName: string }
// the settings tool's results: the gate's rejections, the plan's daily limit, or the save
export type UpdateTopicFieldsResult =
	| TopicToolRejection
	| DailyFrequencyRejection
	| { status: "empty" }
	| { status: "saved"; topicName: string }
// the source tool's results: a value it cannot use, the limit, a source already there, or the save
export type AddTopicSourceResult =
	| TopicToolRejection
	| { status: "invalid" }
	| { status: "limit"; limit: number }
	| { status: "present"; topicSourceLabel: string }
	| { status: "saved"; topicSourceId: string; topicSourceLabel: string; topicSourceCostDelta: TopicSourceCostDelta }
export type RemoveTopicSourceResult = TopicToolRejection | { status: "saved"; topicSourceLabel: string | null }

/**
 * Saves a new prompt and its version in one transaction, when the gate grants the user topic:edit.
 */
export async function updateTopicPrompt({
	userId,
	topicId,
	prompt,
	origin,
}: {
	userId: string | null
	topicId: string
	prompt: string
	origin: PromptVersionOrigin
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
	trackEvent("topic_edited", editableTopic.userId, { topicId, tool: "updateTopicPrompt", origin })
	return { status: "saved", topicName: editableTopic.topic.name }
}

/**
 * Changes only the topic fields that are named.
 */
export async function updateTopicFields({
	userId,
	topicId,
	topicFields,
	promptVersionOrigin,
}: {
	userId: string | null
	topicId: string
	topicFields: UpdateTopicFieldsPayload
	promptVersionOrigin: PromptVersionOrigin
}): Promise<UpdateTopicFieldsResult> {
	// a call that names no field has nothing to save, whatever adapter sent it
	const namedFields = Object.fromEntries(Object.entries(topicFields).filter(([, value]) => value !== undefined))
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
	await db.transaction(async (transaction) => {
		await transaction.update(topics).set(namedFields).where(eq(topics.id, topicId))
		// drop the topic from the featured topics when it stops being public
		if (topicFields.visibility && topicFields.visibility !== "public") {
			await releaseFeatureOrder(topicId, transaction)
		}
	})
	trackEvent("topic_edited", editableTopic.userId, { topicId, tool: "updateTopicFields", origin: promptVersionOrigin })
	return { status: "saved", topicName: topicFields.name ?? editableTopic.topic.name }
}

/**
 * Adds a source from a registry option and value, and returns its projected cost.
 */
export async function addTopicSource({
	userId,
	topicId,
	sourceOption,
	value,
	origin,
}: AddTopicSourcePayload & {
	userId: string | null
	topicId: string
	origin: PromptVersionOrigin
}): Promise<AddTopicSourceResult> {
	// ask the gate whether the user may edit the topic
	const editableTopic = await loadEditableTopic(userId, topicId)
	if (editableTopic.status !== "ok") {
		return editableTopic
	}

	// build the source from the registry, and reject a value it cannot use
	const newTopicSource = toNewTopicSource(sourceOption, value)
	if (!newTopicSource) {
		return { status: "invalid" }
	}

	// load the topic's sources
	const topicSourceRows = await db
		.select({ id: sources.id, kind: sources.kind, config: sources.config, status: sources.status })
		.from(sources)
		.where(eq(sources.topicId, topicId))
	// report a source the topic already has
	const existingTopicSourceRow = topicSourceRows.find((topicSourceRow) =>
		isSameTopicSource(topicSourceRow, newTopicSource),
	)
	if (existingTopicSourceRow) {
		return {
			status: "present",
			topicSourceLabel: toTopicSourceLabel(existingTopicSourceRow.kind, existingTopicSourceRow.config),
		}
	}
	// reject a topic at its source limit
	if (topicSourceRows.length >= MAX_TOPIC_SOURCES) {
		return { status: "limit", limit: MAX_TOPIC_SOURCES }
	}

	// calculate the new source's cost from the topic's ready sources
	const readyTopicSourceCount = topicSourceRows.filter((topicSourceRow) => topicSourceRow.status === "ready").length
	const topicSourceCostDelta = await loadTopicSourceCostDelta(
		editableTopic.topic,
		readyTopicSourceCount,
		newTopicSource.sourceKind,
	)

	// look up a podcast's show name, then insert the source row
	const podcastNames = await toPodcastNames([newTopicSource])
	const topicSourceRow = toNewSourceRow(topicId, newTopicSource, podcastNames)
	const [insertedTopicSource] = await db.insert(sources).values(topicSourceRow).returning({ id: sources.id })
	if (!insertedTopicSource) {
		throw new Error(`failed to add a source to topic ${topicId}`)
	}

	// start the screen for a url source
	if (newTopicSource.sourceKind === "url") {
		startPendingSourceScreens(topicId)
	}
	trackEvent("topic_edited", editableTopic.userId, { topicId, tool: "addSource", origin })
	return {
		status: "saved",
		topicSourceId: insertedTopicSource.id,
		topicSourceLabel: toTopicSourceLabel(topicSourceRow.kind, topicSourceRow.config ?? {}),
		topicSourceCostDelta: topicSourceCostDelta,
	}
}

/**
 * Removes one of the topic's sources, returning saved for a row already gone and missing for another topic's row.
 */
export async function removeTopicSource({
	userId,
	topicId,
	sourceId,
	origin,
}: {
	userId: string | null
	topicId: string
	sourceId: string
	origin: PromptVersionOrigin
}): Promise<RemoveTopicSourceResult> {
	// ask the gate whether the user may edit the topic
	const editableTopic = await loadEditableTopic(userId, topicId)
	if (editableTopic.status !== "ok") {
		return editableTopic
	}

	// load the source row
	const [topicSourceRow] = await db
		.select({ topicId: sources.topicId, kind: sources.kind, config: sources.config })
		.from(sources)
		.where(eq(sources.id, sourceId))
	// return saved for a row already gone, and missing for another topic's row
	if (!topicSourceRow) {
		return { status: "saved", topicSourceLabel: null }
	}
	if (topicSourceRow.topicId !== topicId) {
		return { status: "missing" }
	}

	// delete the row and report which source went
	await db.delete(sources).where(and(eq(sources.id, sourceId), eq(sources.topicId, topicId)))
	trackEvent("topic_edited", editableTopic.userId, { topicId, tool: "removeSource", origin })
	return { status: "saved", topicSourceLabel: toTopicSourceLabel(topicSourceRow.kind, topicSourceRow.config) }
}

// the topic when the user may edit it, else the gate's rejection
async function loadEditableTopic(
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

/**
 * Builds the source the registry defines for an option and value, or null when the value cannot be used.
 */
export function toNewTopicSource(
	sourceOption: AddTopicSourcePayload["sourceOption"],
	value: string,
): NewTopicSource | null {
	// build a default source, which takes no value
	const defaultTopicSource = DEFAULT_SOURCES.find((topicSource) => topicSource.key === sourceOption)
	if (defaultTopicSource) {
		return { sourceKind: defaultTopicSource.sourceKind, config: defaultTopicSource.toConfig() }
	}

	// build a custom option's config from the value, and reject a blank or unusable one
	const topicSourceValue = value.trim()
	const customTopicSourceOption = toCustomSourceOption(sourceOption)
	if (!customTopicSourceOption || !topicSourceValue) {
		return null
	}
	const topicSourceConfig = customTopicSourceOption.toConfig(topicSourceValue)
	return topicSourceConfig ? { sourceKind: customTopicSourceOption.sourceKind, config: topicSourceConfig } : null
}

/**
 * Reports whether a stored source and a new one are the same kind reading the same value.
 */
export function isSameTopicSource(
	topicSourceRow: { kind: string; config: Record<string, unknown> },
	newTopicSource: NewTopicSource,
): boolean {
	return (
		topicSourceRow.kind === newTopicSource.sourceKind &&
		toSourceValue(topicSourceRow.kind, topicSourceRow.config) ===
			toSourceValue(newTopicSource.sourceKind, newTopicSource.config)
	)
}

// the projected cost of one more source, from the topic's recent succeeded scans
async function loadTopicSourceCostDelta(
	topic: Pick<typeof topics.$inferSelect, "id" | "frequency">,
	readyTopicSourceCount: number,
	sourceKind: string,
): Promise<TopicSourceCostDelta> {
	// load the topic's newest succeeded scans
	const recentScanRows = await db
		.select({ cost: scans.cost })
		.from(scans)
		.where(and(eq(scans.topicId, topic.id), eq(scans.status, "succeeded")))
		.orderBy(desc(scans.startedAt))
		.limit(COST_AVERAGE_SCAN_COUNT)
	return toTopicSourceCostDelta({
		recentScanCostDollars: recentScanRows.map((scanRow) => Number(scanRow.cost)),
		readyTopicSourceCount,
		sourceKind,
		frequency: topic.frequency,
	})
}

/**
 * Projects what one more source adds to the topic's cost, in cents per scan and per month.
 */
export function toTopicSourceCostDelta({
	recentScanCostDollars,
	readyTopicSourceCount,
	sourceKind,
	frequency,
}: {
	recentScanCostDollars: number[]
	readyTopicSourceCount: number
	sourceKind: string
	frequency: (typeof frequencies)[number]
}): TopicSourceCostDelta {
	// split the topic's mean scan cost across its ready sources, or the average scan cost across the fallback count
	const scanCount = recentScanCostDollars.length
	const meanScanCents =
		(recentScanCostDollars.reduce((sum, dollars) => sum + dollars, 0) / Math.max(1, scanCount)) * 100
	const perTopicSourceCents =
		scanCount === 0 ? SCAN_COST_CENTS / FALLBACK_SOURCE_COUNT : meanScanCents / Math.max(1, readyTopicSourceCount)

	// add a paid kind's ingestion cost, then round
	const perScanCents = perTopicSourceCents + (INGESTION_COST_DOLLARS[sourceKind] ?? 0) * 100
	return {
		perScanCents: Math.round(perScanCents * 10) / 10,
		perMonthCents: Math.round(perScanCents * SCANS_PER_MONTH[frequency]),
	}
}

/**
 * Labels a source by its kind, plus the registry's summary when there is one.
 */
export function toTopicSourceLabel(sourceKind: string, config: Record<string, unknown>): string {
	const topicSourceSummary = toSourceSummary(sourceKind, config)
	return topicSourceSummary ? `${sourceKind} — ${topicSourceSummary}` : sourceKind
}

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
	// draw on the daily suggestion limit
	if (!(await incrementDaySuggestionCount(userId))) {
		return { status: "limit" }
	}

	// the model call bills to the user's own key
	const [userRow] = await db
		.select({ litellmVirtualKey: users.litellmVirtualKey })
		.from(users)
		.where(eq(users.id, userId))
	const suggestedSources = await suggestSources({
		name,
		prompt,
		attachmentContext: "",
		excludeSources: [],
		limit: MAX_TOPIC_SOURCES,
		litellmApiKey: userRow?.litellmVirtualKey ?? undefined,
	})
	return { status: "ok", sources: suggestedSources }
}
