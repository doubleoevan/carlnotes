// the limits that the scheduled Topics' owners' plans and budgets set on the sweep: the daily topic limit, the daily
// Topics that run weekly past the daily scans cutoff, and the owners whose key budget is spent
import { isDailyFrequency } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { HOUR_MS } from "@shared/time"
import { and, eq, gte, inArray } from "drizzle-orm"
import { db } from "../db"
import { isMonthlyBudgetCutoffPassed } from "../db/monthlyBudgetCutoffs"
import { dailyTopicIdsWithinLimit, startOfUtcMonth } from "../db/quotas"
import { cacheJson } from "../db/redis"
import { runWithRequestMemo } from "../db/requestMemo"
import { scans } from "../db/schema/scans"
import { runWithConcurrency } from "./concurrency"
import { isUserLiteLLMKeyBudgetExhausted } from "./litellm"
import { frequencyWindowMs, type StartScheduledTopicScansOptions, type Topic } from "./schedule"

// how many owners' daily topic allowances the sweep reads at once, and how many owners' key budgets or daily scans
// cutoffs
const DAILY_TOPIC_IDS_LOAD_CONCURRENCY = 8
const OWNER_BUDGET_READ_CONCURRENCY = 8

// how long an owner's daily scans cutoff result stays in Redis, so a daily Topic held to weekly reads its owner's cutoff
// once an hour instead of on every sweep
const DAILY_SCANS_CUTOFF_TTL_MS = HOUR_MS

// the daily Topics that each owner's plan still runs, the daily Topics that run weekly and scanned in the past seven
// days, and the owners whose key budget is spent
export type ScheduledTopicLimits = Required<
	Pick<
		StartScheduledTopicScansOptions,
		"dailyTopicIdsByOwner" | "dailyTopicOnWeeklyScanIds" | "budgetExhaustedOwnerIds"
	>
>

/**
 * Returns the limits that the scheduled Topics' owners' plans and budgets set on the Topics. The loads share one memo,
 * so each owner's access row is read once across them.
 */
export function loadScheduledTopicLimits(scheduledTopics: Topic[], now: Date): Promise<ScheduledTopicLimits> {
	return runWithRequestMemo(async () => {
		// load the three limits at once, inside the memo
		const [dailyTopicIdsByOwner, dailyTopicOnWeeklyScanIds, budgetExhaustedOwnerIds] = await Promise.all([
			loadDailyTopicIdsByOwner(scheduledTopics),
			loadDailyTopicOnWeeklyScanIds(scheduledTopics, now),
			loadBudgetExhaustedOwnerIds(scheduledTopics),
		])
		return { dailyTopicIdsByOwner, dailyTopicOnWeeklyScanIds, budgetExhaustedOwnerIds }
	})
}

/**
 * Whether the sweep still runs this Topic under its owner's daily topic limit. A Topic on a weekly frequency
 * draws on no daily allowance at all, so the limit never touches it.
 */
export function isWithinDailyTopicLimit(
	topic: Pick<Topic, "id" | "frequency">,
	ownerDailyTopicIds: Set<string> | undefined,
): boolean {
	return !isDailyFrequency(topic.frequency) || Boolean(ownerDailyTopicIds?.has(topic.id))
}

// the daily Topics that each owner's plan can run, keyed by the owner for reuse
async function loadDailyTopicIdsByOwner(scheduledTopics: Topic[]): Promise<Map<string, Set<string>>> {
	const { ownerIds } = toDailyTopicOwners(scheduledTopics)
	const dailyTopicIdsByOwnerEntries = await runWithConcurrency(
		ownerIds,
		DAILY_TOPIC_IDS_LOAD_CONCURRENCY,
		async (ownerId): Promise<[string, Set<string>]> => [ownerId, await dailyTopicIdsWithinLimit(ownerId)],
	)
	return new Map(dailyTopicIdsByOwnerEntries)
}

/**
 * Returns the ids of the scheduled Topics' owners whose key budget is spent, reading each owner's budget once.
 * An owner who has no key, or whose budget read fails, is left out.
 */
export async function loadBudgetExhaustedOwnerIds(scheduledTopics: Pick<Topic, "ownerId">[]): Promise<Set<string>> {
	// read each distinct owner's budget.
	// a read that throws an error is reported, and that owner's budget counts as not spent
	return loadMatchingOwnerIds({
		ownerIds: [...new Set(scheduledTopics.map((topic) => topic.ownerId))],
		readDescription: "the key budget",
		isOwnerMatching: isUserLiteLLMKeyBudgetExhausted,
	})
}

/**
 * Returns the ids of the scheduled daily Topics that scanned in the past seven days and whose owner's spend is past the
 * daily scans cutoff, past which a daily Topic scans weekly. Each owner's cutoff result is cached in Redis for an hour.
 * An owner whose cutoff read fails is reported, and their Topics scan daily.
 */
export async function loadDailyTopicOnWeeklyScanIds(scheduledTopics: Topic[], now: Date): Promise<Set<string>> {
	// the distinct owners of the scheduled daily Topics whose spend is past the daily scans cutoff
	const { dailyTopics, ownerIds } = toDailyTopicOwners(scheduledTopics)
	const cutoffPassedOwnerIds = await loadMatchingOwnerIds({
		ownerIds,
		readDescription: "the daily scans cutoff",
		isOwnerMatching: (ownerId) => isDailyScansCutoffPassed(ownerId, now),
	})

	// the daily Topics of the owners past the cutoff. none means no Scan read
	const cutoffPassedDailyTopicIds = dailyTopics
		.filter((topic) => cutoffPassedOwnerIds.has(topic.ownerId))
		.map((topic) => topic.id)
	if (cutoffPassedDailyTopicIds.length === 0) {
		return new Set()
	}

	// of those, the Topics with a Scan that succeeded in the past week
	const scannedTopicRows = await db
		.selectDistinct({ topicId: scans.topicId })
		.from(scans)
		.where(
			and(
				inArray(scans.topicId, cutoffPassedDailyTopicIds),
				eq(scans.status, "succeeded"),
				gte(scans.startedAt, new Date(now.getTime() - frequencyWindowMs("weekly"))),
			),
		)
	return new Set(scannedTopicRows.flatMap((scannedTopicRow) => scannedTopicRow.topicId ?? []))
}

// the scheduled Topics on a daily frequency, and the distinct ids of their owners
function toDailyTopicOwners(scheduledTopics: Topic[]): { dailyTopics: Topic[]; ownerIds: string[] } {
	const dailyTopics = scheduledTopics.filter((topic) => isDailyFrequency(topic.frequency))
	return { dailyTopics, ownerIds: [...new Set(dailyTopics.map((topic) => topic.ownerId))] }
}

// the distinct owners to read, how a failed read names what it read, and the read that matches one owner
type LoadMatchingOwnerIdsOptions = {
	ownerIds: string[]
	readDescription: string
	isOwnerMatching: (ownerId: string) => Promise<boolean>
}

// the ids of the owners whose read matches, reading each owner once.
// a read that throws an error is reported, and that owner is left out
async function loadMatchingOwnerIds({
	ownerIds,
	readDescription,
	isOwnerMatching,
}: LoadMatchingOwnerIdsOptions): Promise<Set<string>> {
	const isOwnerMatchingResults = await runWithConcurrency(ownerIds, OWNER_BUDGET_READ_CONCURRENCY, (ownerId) =>
		isOwnerMatching(ownerId).catch((error: unknown) => {
			console.error(`could not read ${readDescription} for owner ${ownerId}`, error)
			reportError(error, "scheduled-scan", { ownerId })
			return false
		}),
	)
	return new Set(ownerIds.filter((_ownerId, i) => isOwnerMatchingResults[i]))
}

// whether the owner's spend is past the daily scans cutoff, cached in Redis for an hour under the owner and the UTC
// month. a failed cutoff read throws an error and caches nothing
function isDailyScansCutoffPassed(ownerId: string, now: Date): Promise<boolean> {
	return cacheJson({
		key: `daily-scans-cutoff:${startOfUtcMonth(now).toISOString().slice(0, 7)}:${ownerId}`,
		ttlMs: DAILY_SCANS_CUTOFF_TTL_MS,
		load: () => isMonthlyBudgetCutoffPassed(ownerId, "dailyScans"),
	})
}
