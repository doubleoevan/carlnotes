// the topic source tools: adding and removing a source, and what one more source costs

import type { frequencies } from "@carlnotes/contracts/enums"
import { SCAN_COST_CENTS, toMeanScanCents } from "@carlnotes/contracts/plans"
import { DEFAULT_SOURCES, toCustomSourceOption, toSourceSummary, toSourceValue } from "@carlnotes/contracts/sources"
import type { AddTopicSourcePayload } from "@carlnotes/contracts/topicPayloads"
import { MAX_TOPIC_SOURCES } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { loadRecentScanCostDollars } from "@carlnotes/db/monthlyBudgetCutoffs"
import { scans } from "@carlnotes/db/schema/scans"
import { sources, topics } from "@carlnotes/db/schema/topics"
import { EXA_COST_PER_SEARCH, X_COST_PER_READ } from "@carlnotes/models/budget"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, count, eq } from "drizzle-orm"
import type { AnalyticsProperties } from "../currentUser"
import { clearVisitorTopicCaches } from "../topic/feeds"
import type { PromptVersionOrigin } from "../topic/promptVersions"
import { type NewTopicSource, startPendingSourceScreens, toNewSourceRow, toPodcastNames } from "../topic/saveHelpers"
import { loadEditableTopic, type TopicToolRejection, toToolAnalyticsProperties } from "./topicTools"

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

// what one more source is projected to cost, in cents per scan and per month at the topic's frequency
export type TopicSourceCostDelta = { perScanCents: number; perMonthCents: number }

// the source tool's results: a value it cannot use, the limit, a source already there, or the save
export type AddTopicSourceResult =
	| TopicToolRejection
	| { status: "invalid" }
	| { status: "limit"; limit: number }
	| { status: "present"; topicSourceLabel: string }
	| { status: "saved"; topicSourceId: string; topicSourceLabel: string; topicSourceCostDelta: TopicSourceCostDelta }

// the remove tool's results. a gate rejection, a source a rule keeps, or the save
export type RemoveTopicSourceResult =
	| TopicToolRejection
	| { status: "lastSource" }
	| { status: "webSearch" }
	| { status: "saved"; topicSourceLabel: string | null }

/**
 * Adds a source from a registry option and value, and returns its projected cost.
 */
export async function addTopicSource({
	userId,
	topicId,
	sourceOption,
	value,
	origin,
	analyticsProperties,
}: AddTopicSourcePayload & {
	userId: string | null
	topicId: string
	origin: PromptVersionOrigin
	analyticsProperties?: AnalyticsProperties
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

	// start the screen for a url source, drop the topic's cached visitor copies, which list the sources, and report the
	// source by its kind
	if (newTopicSource.sourceKind === "url") {
		startPendingSourceScreens(topicId)
	}
	await clearVisitorTopicCaches({ topicId, visibility: editableTopic.topic.visibility })
	trackEvent("source_added", editableTopic.userId, {
		...toToolAnalyticsProperties(origin, analyticsProperties),
		topicId,
		sourceType: newTopicSource.sourceKind,
		origin,
	})
	return {
		status: "saved",
		topicSourceId: insertedTopicSource.id,
		topicSourceLabel: toTopicSourceLabel(topicSourceRow.kind, topicSourceRow.config ?? {}),
		topicSourceCostDelta: topicSourceCostDelta,
	}
}

/**
 * Removes one of the topic's sources, returning saved for a row already gone and missing for another topic's row. A
 * topic keeps its web search, which only the topic editor turns off, and at least one source.
 */
export async function removeTopicSource({
	userId,
	topicId,
	sourceId,
	origin,
	analyticsProperties,
}: {
	userId: string | null
	topicId: string
	sourceId: string
	origin: PromptVersionOrigin
	analyticsProperties?: AnalyticsProperties
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

	// keep web search, which only the topic editor turns off
	if (topicSourceRow.kind === "search") {
		return { status: "webSearch" }
	}

	// lock the topic row while counting its sources, so two removals at once never leave the topic with none
	const removal = await db.transaction(async (transaction): Promise<"removed" | "gone" | "lastSource"> => {
		await transaction.select({ id: topics.id }).from(topics).where(eq(topics.id, topicId)).for("no key update")

		// a removal that ran at the same time may already have deleted the row
		const [lockedSourceRow] = await transaction
			.select({ id: sources.id })
			.from(sources)
			.where(and(eq(sources.id, sourceId), eq(sources.topicId, topicId)))
		if (!lockedSourceRow) {
			return "gone"
		}

		// keep the topic's last source
		const [sourceCountRow] = await transaction
			.select({ sourceCount: count() })
			.from(sources)
			.where(eq(sources.topicId, topicId))
		if ((sourceCountRow?.sourceCount ?? 0) <= 1) {
			return "lastSource"
		}

		// delete the row while the topic row is still locked
		await transaction.delete(sources).where(and(eq(sources.id, sourceId), eq(sources.topicId, topicId)))
		return "removed"
	})

	// a row another removal deleted first is saved with no label, and the last source stays
	if (removal === "gone") {
		return { status: "saved", topicSourceLabel: null }
	}
	if (removal === "lastSource") {
		return { status: "lastSource" }
	}

	// drop the topic's cached visitor copies, which list the sources, and report which source went
	await clearVisitorTopicCaches({ topicId, visibility: editableTopic.topic.visibility })
	trackEvent("source_removed", editableTopic.userId, {
		...toToolAnalyticsProperties(origin, analyticsProperties),
		topicId,
		sourceType: topicSourceRow.kind,
		origin,
	})
	return { status: "saved", topicSourceLabel: toTopicSourceLabel(topicSourceRow.kind, topicSourceRow.config) }
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
	// load the cost of the topic's newest succeeded scans
	const recentScanCostDollars = await loadRecentScanCostDollars({
		scanFilter: eq(scans.topicId, topic.id),
		scanCount: COST_AVERAGE_SCAN_COUNT,
	})
	return toTopicSourceCostDelta({
		recentScanCostDollars,
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
	const meanScanCents = toMeanScanCents(recentScanCostDollars)
	const perTopicSourceCents =
		meanScanCents === null
			? SCAN_COST_CENTS / FALLBACK_SOURCE_COUNT
			: meanScanCents / Math.max(1, readyTopicSourceCount)

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
