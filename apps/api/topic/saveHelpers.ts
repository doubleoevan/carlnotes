// the helpers for saving a topic: the daily slot its frequency takes, its new source rows, and its first scan
import { isDailyFrequency } from "@carlnotes/contracts/enums"
import { FIRST_SCAN_PAUSED_REASON, FIRST_SCAN_SPENT_BUDGET_REASON } from "@carlnotes/contracts/scanFailure"
import type { UpdateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import type { scans } from "@carlnotes/db/schema/scans"
import type { sources } from "@carlnotes/db/schema/topics"
import { isUserLiteLLMKeyBudgetExhausted } from "@carlnotes/models/litellm"
import { lookupPodcast } from "@carlnotes/pipeline/ingest/podcast"
import { failUnstartedScan, scanTopic } from "@carlnotes/pipeline/scan"
import { screenPendingSources, screenTopicSources } from "@carlnotes/pipeline/screen"
import { reportError } from "@carlnotes/server/monitoring"
import { isMonthlySpendExhausted, loadDailyFrequencyAuthorization } from "../authorization"

// a rejected attempt to add one more topic on a daily frequency, including the plan's limit so the message can show it
export type DailyFrequencyRejection = { status: "dailyFrequency"; limit: number }

// a Source that the payload adds instead of an existing one
export type NewTopicSource = Extract<UpdateTopicPayload["sources"][number], { sourceKind: string }>
export type Scan = typeof scans.$inferSelect

/**
 * Whether saving this frequency takes a new daily slot
 */
export function isTakingDailySlot(savedFrequency: string, currentFrequency?: string): boolean {
	return isDailyFrequency(savedFrequency) && !isDailyFrequency(currentFrequency ?? "")
}

/**
 * The rejection when a payload moves a topic onto a daily frequency past the plan's daily topic limit, or null if not
 */
export async function authorizeNewDailyTopic(
	userId: string,
	topicPayload: Pick<UpdateTopicPayload, "frequency">,
	currentFrequency?: string,
): Promise<DailyFrequencyRejection | null> {
	if (!isTakingDailySlot(topicPayload.frequency, currentFrequency)) {
		return null
	}
	const authorization = await loadDailyFrequencyAuthorization(userId)
	return authorization.status === "quota" ? { status: "dailyFrequency", limit: authorization.limit } : null
}

// a new topic Source row
export function toNewSourceRow(
	topicId: string,
	source: NewTopicSource,
	podcastNames: Map<string, string>,
): typeof sources.$inferInsert {
	// a podcast Source keeps the show's name beside its id, so it reads by name instead of by number
	const podcastId = source.config.podcastId
	const podcastName = typeof podcastId === "string" ? podcastNames.get(podcastId) : undefined
	return {
		topicId,
		kind: source.sourceKind,
		config: podcastName ? { ...source.config, name: podcastName } : source.config,
		status: source.sourceKind === "url" ? "pending" : "ready",
	}
}

// the show names for the podcast Sources this payload adds, read before the writing
export async function toPodcastNames(payloadSources: UpdateTopicPayload["sources"]): Promise<Map<string, string>> {
	// the ids this payload adds without a name of their own
	const podcastIds = payloadSources.flatMap((source) =>
		"id" in source ||
		source.sourceKind !== "podcast" ||
		typeof source.config.podcastId !== "string" ||
		typeof source.config.name === "string"
			? []
			: [source.config.podcastId],
	)
	if (podcastIds.length === 0) {
		return new Map()
	}

	// look every show up at once. iTunes being unreachable costs a name, but not the save
	const podcasts = await Promise.all(podcastIds.map((podcastId) => lookupPodcast(podcastId).catch(() => null)))
	return new Map(podcasts.flatMap((podcast) => (podcast ? [[podcast.podcastId, podcast.name] as const] : [])))
}

// start the llm-guard screen for the Topic's newly saved url Sources asynchronously, without delaying the save
export function startPendingSourceScreens(topicId: string): void {
	screenPendingSources(topicId).catch((error) => {
		console.error(`could not start source screens for topic ${topicId}`, error)
		reportError(error, "source-screen", { topicId })
	})
}

/**
 * Screens the new Topic's url Sources with llm-guard, then starts the Topic's first Scan.
 * If the owner's budget is spent, or the owner's spend is past the manual scans cutoff, the first Scan is marked failed
 * instead of started.
 */
export async function startFirstScan(topicId: string, firstScan: Scan | undefined, ownerId: string): Promise<void> {
	// read the owner's budgets before the wait for the Source screens
	const firstScanFailureReason = firstScan ? await loadFirstScanFailureReason({ topicId, ownerId }) : null

	// mark the first Scan failed if the owner's budget is spent or their spend is past the manual scans cutoff, and start
	// the Source screens without the wait
	if (firstScan && firstScanFailureReason) {
		await failUnstartedScan(firstScan.id, firstScanFailureReason)
		await screenPendingSources(topicId)
		return
	}

	// screen the Topic's url Sources and wait for the screens, then start the first Scan.
	// the Scan row was opened at creation, so a rejected or failed start leaves the row in place
	await screenTopicSources(topicId)
	if (firstScan) {
		await scanTopic(firstScan, topicId, ownerId, "creation", true)
	}
}

// the new Topic and its owner
type LoadFirstScanFailureReasonOptions = { topicId: string; ownerId: string }

// the reason a first Scan fails instead of starting, or null to start it. a spent key budget or monthly budget fails it
// as spent, and spend past the manual scans cutoff fails it as paused
async function loadFirstScanFailureReason({
	topicId,
	ownerId,
}: LoadFirstScanFailureReasonOptions): Promise<string | null> {
	// report a read that throws an error, and count that check as not reached
	const toUnreachedOnError =
		(budgetCheckName: string) =>
		(error: unknown): boolean => {
			console.error(`could not read the ${budgetCheckName} for the first scan of topic ${topicId}`, error)
			reportError(error, "first-scan", { topicId, ownerId })
			return false
		}

	// read the key budget, the monthly budget, and the manual scans cutoff at once
	const [isKeyBudgetExhausted, isMonthlyBudgetExhausted, isManualScanPaused] = await Promise.all([
		isUserLiteLLMKeyBudgetExhausted(ownerId).catch(toUnreachedOnError("key budget")),
		isMonthlySpendExhausted(ownerId).catch(toUnreachedOnError("monthly spend")),
		isMonthlyBudgetCutoffPassed(ownerId, "manualScans").catch(toUnreachedOnError("manual scans cutoff")),
	])

	// a spent budget comes first, then a passed cutoff
	if (isKeyBudgetExhausted || isMonthlyBudgetExhausted) {
		return FIRST_SCAN_SPENT_BUDGET_REASON
	}
	return isManualScanPaused ? FIRST_SCAN_PAUSED_REASON : null
}
