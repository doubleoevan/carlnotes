// the daily spend cutoffs: the spend control settings with their defaults, the day's free-plan spend, whether each
// cutoff is passed, which scans wait for the first scan dispatch limit, and whether the unverified accounts switch
// limits a user
import type { DailySpendCutoffKind, SpendControlSettings } from "@carlnotes/contracts/admin"
import { DAY_MS, HOUR_MS, toUtcDay } from "@carlnotes/contracts/time"
import { toPositiveCents, toPositiveInteger, toWholeNumber } from "@carlnotes/server/envSettings"
import { reportError } from "@carlnotes/server/monitoring"
import { generatedChapterImageLimit } from "@carlnotes/server/podcastEpisodeSettings"
import { and, eq, gte, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "./index"
import { loadSpendSince, loadUserAccess, startOfUtcDay, toPlanUserIdQuery, toSpendCents } from "./quotas"
import { cacheJson } from "./redis"
import { memoizeInRequest } from "./requestMemo"
import { scans } from "./schema/scans"
import { spendControlSettings } from "./schema/spendControlSettings"
import { accounts, users } from "./schema/users"

// the stored overrides. a null value reads as that setting's default. a cached value that a replica wrote before a
// newer setting existed lacks that setting, which reads as off or as its default
export type SpendControlOverrides = Pick<
	typeof spendControlSettings.$inferSelect,
	| "podcastEpisodesCutoffCents"
	| "scheduledScansCutoffCents"
	| "chatCutoffCents"
	| "firstScanDispatchLimit"
	| "hourlySignupAlertCount"
	| "isUnverifiedFirstScanLimitOn"
> &
	Partial<Pick<typeof spendControlSettings.$inferSelect, NewerSpendControlColumn>>

// the settings added after the first ones, which a cached value may lack
type NewerSpendControlColumn =
	| "generatedChapterImageLimit"
	| "isPodcastEpisodeRecordingPaused"
	| "isTopicPodcastEpisodeVideoRenderingPaused"
	| "isHomePinnedOnly"

// the cutoff state a reader acts on: the day's free-plan spend and the settings in effect, or unavailable after a failed
// read, which passes no cutoff and leaves no scan waiting
export type DailySpendCutoffState =
	| { status: "loaded"; freePlanSpendCents: number; settings: SpendControlSettings }
	| { status: "unavailable" }

// the Redis key the overrides are read through, and the prefix of the key each UTC day's free-plan spend is read through
export const SPEND_CONTROL_SETTINGS_KEY = "spend-control-settings"
const FREE_PLAN_SPEND_KEY_PREFIX = "free-plan-spend"

// how long a cached read stays in Redis
const SPEND_CONTROL_CACHE_TTL_MS = 60_000

// the key that one request's cutoff state is kept under
const DAILY_SPEND_CUTOFF_STATE_MEMO_KEY = "daily-spend-cutoff-state"

// the provider id of a password sign-in account, and the name the first scan filter reads the earlier scans under
const PASSWORD_PROVIDER_ID = "credential"
const EARLIER_SCANS_ALIAS = "earlier_scans"

// no override at all, for an empty table
export const NO_SPEND_CONTROL_OVERRIDES: SpendControlOverrides = {
	podcastEpisodesCutoffCents: null,
	scheduledScansCutoffCents: null,
	chatCutoffCents: null,
	firstScanDispatchLimit: null,
	hourlySignupAlertCount: null,
	isUnverifiedFirstScanLimitOn: false,
	generatedChapterImageLimit: null,
	isPodcastEpisodeRecordingPaused: false,
	isTopicPodcastEpisodeVideoRenderingPaused: false,
	isHomePinnedOnly: false,
}

// the results of a failed read. each is its own object, so the cache can tell it apart by identity and leave it unstored
const UNAVAILABLE_SPEND_CONTROL_OVERRIDES: SpendControlOverrides = { ...NO_SPEND_CONTROL_OVERRIDES }
const UNAVAILABLE_FREE_PLAN_SPEND = { freePlanSpendCents: -1 }

/**
 * Returns the default spend control settings, each from Doppler, or the built-in default if its Doppler value is unset,
 * empty, or invalid.
 */
export function defaultSpendControlSettings(): SpendControlSettings {
	return {
		podcastEpisodesCutoffCents: toPositiveCents(Bun.env.PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD, 65),
		scheduledScansCutoffCents: toPositiveCents(Bun.env.SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD, 100),
		chatCutoffCents: toPositiveCents(Bun.env.CHAT_DAILY_SPEND_CUTOFF_USD, 150),
		firstScanDispatchLimit: toWholeNumber(Bun.env.FIRST_SCAN_DISPATCH_LIMIT, 5),
		hourlySignupAlertCount: toPositiveInteger(Bun.env.HOURLY_SIGNUP_ALERT_COUNT, 50),
		generatedChapterImageLimit: generatedChapterImageLimit(),
		isUnverifiedFirstScanLimitOn: false,
		isPodcastEpisodeRecordingPaused: false,
		isTopicPodcastEpisodeVideoRenderingPaused: false,
		isHomePinnedOnly: false,
	}
}

/**
 * Returns the settings in effect: each override where one is stored, and the default where none is. A setting that the
 * overrides lack reads as off or as its default.
 */
export function toSpendControlSettings(overrides: SpendControlOverrides): SpendControlSettings {
	const defaultSettings = defaultSpendControlSettings()
	return {
		// each numeric setting, overridden or at its default
		podcastEpisodesCutoffCents: overrides.podcastEpisodesCutoffCents ?? defaultSettings.podcastEpisodesCutoffCents,
		scheduledScansCutoffCents: overrides.scheduledScansCutoffCents ?? defaultSettings.scheduledScansCutoffCents,
		chatCutoffCents: overrides.chatCutoffCents ?? defaultSettings.chatCutoffCents,
		firstScanDispatchLimit: overrides.firstScanDispatchLimit ?? defaultSettings.firstScanDispatchLimit,
		hourlySignupAlertCount: overrides.hourlySignupAlertCount ?? defaultSettings.hourlySignupAlertCount,
		generatedChapterImageLimit: overrides.generatedChapterImageLimit ?? defaultSettings.generatedChapterImageLimit,
		// each switch, off unless it is stored as on
		isUnverifiedFirstScanLimitOn: overrides.isUnverifiedFirstScanLimitOn,
		isPodcastEpisodeRecordingPaused: overrides.isPodcastEpisodeRecordingPaused ?? false,
		isTopicPodcastEpisodeVideoRenderingPaused: overrides.isTopicPodcastEpisodeVideoRenderingPaused ?? false,
		isHomePinnedOnly: overrides.isHomePinnedOnly ?? false,
	}
}

/**
 * Returns the settings in effect, read through the one-minute cache, or the defaults after a failed read.
 */
export async function loadSpendControlSettings(): Promise<SpendControlSettings> {
	return toSpendControlSettings(await loadCachedSpendControlOverrides())
}

/**
 * Returns the day's free-plan spend and the settings in effect, each read through a one-minute cache.
 * A failed read of either returns the unavailable state, which is reported and never cached.
 */
export async function loadDailySpendCutoffState(now = new Date()): Promise<DailySpendCutoffState> {
	// read the overrides and the day's free-plan spend at once
	const [overrides, freePlanSpend] = await Promise.all([
		loadCachedSpendControlOverrides(),
		loadCachedFreePlanSpend(now),
	])

	// a failed read of either passes no cutoff
	if (overrides === UNAVAILABLE_SPEND_CONTROL_OVERRIDES || freePlanSpend.freePlanSpendCents < 0) {
		return { status: "unavailable" }
	}
	return {
		status: "loaded",
		freePlanSpendCents: freePlanSpend.freePlanSpendCents,
		settings: toSpendControlSettings(overrides),
	}
}

// the cutoff state that one request reads once, however many checks it runs
function loadRequestDailySpendCutoffState(): Promise<DailySpendCutoffState> {
	return memoizeInRequest(DAILY_SPEND_CUTOFF_STATE_MEMO_KEY, () => loadDailySpendCutoffState())
}

/**
 * Whether the day's free-plan spend is at or past the cutoff. An unavailable state passes no cutoff.
 */
export function isDailySpendCutoffPassed(cutoffState: DailySpendCutoffState, kind: DailySpendCutoffKind): boolean {
	if (cutoffState.status === "unavailable") {
		return false
	}
	return cutoffState.freePlanSpendCents >= toDailySpendCutoffCents(cutoffState.settings, kind)
}

// a daily spend cutoff's amount in cents from the settings
function toDailySpendCutoffCents(settings: SpendControlSettings, kind: DailySpendCutoffKind): number {
	const cutoffCentsByKind: Record<DailySpendCutoffKind, number> = {
		podcastEpisodes: settings.podcastEpisodesCutoffCents,
		scheduledScans: settings.scheduledScansCutoffCents,
		chat: settings.chatCutoffCents,
	}
	return cutoffCentsByKind[kind]
}

/**
 * Returns how many waiting scans one sweep starts, or zero for an unavailable state.
 */
export function toFirstScanDispatchLimit(cutoffState: DailySpendCutoffState): number {
	return cutoffState.status === "loaded" ? cutoffState.settings.firstScanDispatchLimit : 0
}

// the stored overrides, or no override for an empty table. a failed read throws an error
async function loadSpendControlOverrides(): Promise<SpendControlOverrides> {
	const [overrides] = await db.select(SPEND_CONTROL_OVERRIDE_COLUMNS).from(spendControlSettings)
	return overrides ?? NO_SPEND_CONTROL_OVERRIDES
}

// the columns that hold the overrides
const SPEND_CONTROL_OVERRIDE_COLUMNS = {
	podcastEpisodesCutoffCents: spendControlSettings.podcastEpisodesCutoffCents,
	scheduledScansCutoffCents: spendControlSettings.scheduledScansCutoffCents,
	chatCutoffCents: spendControlSettings.chatCutoffCents,
	firstScanDispatchLimit: spendControlSettings.firstScanDispatchLimit,
	hourlySignupAlertCount: spendControlSettings.hourlySignupAlertCount,
	isUnverifiedFirstScanLimitOn: spendControlSettings.isUnverifiedFirstScanLimitOn,
	generatedChapterImageLimit: spendControlSettings.generatedChapterImageLimit,
	isPodcastEpisodeRecordingPaused: spendControlSettings.isPodcastEpisodeRecordingPaused,
	isTopicPodcastEpisodeVideoRenderingPaused: spendControlSettings.isTopicPodcastEpisodeVideoRenderingPaused,
	isHomePinnedOnly: spendControlSettings.isHomePinnedOnly,
}

/**
 * Loads the UTC day's recorded spend billed to the users on the free plan who are not admins, in cents.
 */
export async function loadFreePlanSpendCents(now = new Date()): Promise<number> {
	return toSpendCents(await loadSpendSince({ since: startOfUtcDay(now), billedPlan: "free" }))
}

/**
 * Counts the accounts that the past hour created.
 */
export async function countHourlySignups(now = new Date()): Promise<number> {
	const [hourlySignupRow] = await db
		.select({ count: sql<string>`count(*)` })
		.from(users)
		.where(gte(users.createdAt, new Date(now.getTime() - HOUR_MS)))
	return Number(hourlySignupRow?.count ?? 0)
}

/**
 * Returns the Redis key that the UTC day's free-plan spend is read through.
 */
export function toFreePlanSpendKey(now: Date): string {
	return `${FREE_PLAN_SPEND_KEY_PREFIX}:${toUtcDay(now)}`
}

// the stored overrides through the cache, or the unavailable overrides after a failed read, which is reported
function loadCachedSpendControlOverrides(): Promise<SpendControlOverrides> {
	return cacheJson({
		key: SPEND_CONTROL_SETTINGS_KEY,
		ttlMs: SPEND_CONTROL_CACHE_TTL_MS,
		load: () =>
			loadSpendControlOverrides().catch((error: unknown) => {
				reportError(error, "database", { read: SPEND_CONTROL_SETTINGS_KEY })
				return UNAVAILABLE_SPEND_CONTROL_OVERRIDES
			}),
		isStorable: (overrides) => overrides !== UNAVAILABLE_SPEND_CONTROL_OVERRIDES,
	})
}

// the day's free-plan spend through a cache that never outlives the day, or the unavailable spend after a failed read,
// which is reported
function loadCachedFreePlanSpend(now: Date): Promise<{ freePlanSpendCents: number }> {
	const nextDayStartMs = startOfUtcDay(now).getTime() + DAY_MS
	return cacheJson({
		key: toFreePlanSpendKey(now),
		ttlMs: Math.min(SPEND_CONTROL_CACHE_TTL_MS, nextDayStartMs - now.getTime()),
		load: () =>
			loadFreePlanSpendCents(now).then(
				(freePlanSpendCents) => ({ freePlanSpendCents }),
				(error: unknown) => {
					reportError(error, "database", { read: FREE_PLAN_SPEND_KEY_PREFIX })
					return UNAVAILABLE_FREE_PLAN_SPEND
				},
			),
		isStorable: (freePlanSpend) => freePlanSpend !== UNAVAILABLE_FREE_PLAN_SPEND,
	})
}

/**
 * Returns the filter that matches a Topic's first Scan: no earlier Scan of its Topic by start time, then by id.
 */
export function toFirstScanFilter(): SQL {
	const earlierScans = alias(scans, EARLIER_SCANS_ALIAS)
	return sql`not exists (select 1 from ${scans} ${sql.identifier(EARLIER_SCANS_ALIAS)} where ${earlierScans.topicId} = ${scans.topicId} and (${earlierScans.startedAt}, ${earlierScans.id}) < (${scans.startedAt}, ${scans.id}))`
}

/**
 * Returns the filter that matches the waiting scans: running, undispatched rows of free owners who are not admins that
 * the first scan dispatch limit applies to. An unavailable state, or a state where the limit applies to nothing, matches no row.
 */
export function toWaitingScanFilter(cutoffState: DailySpendCutoffState): SQL {
	// past the scheduled scans cutoff a first scan or a manual scan waits, and the switch makes an unverified password
	// account's first and manual scans wait
	const isScheduledScansCutoffPassed = isDailySpendCutoffPassed(cutoffState, "scheduledScans")
	const isUnverifiedFirstScanLimitOn = isUnverifiedFirstScanLimitApplied(cutoffState)
	if (!isScheduledScansCutoffPassed && !isUnverifiedFirstScanLimitOn) {
		return sql`false`
	}

	// the rows the limit applies to, by why they wait
	const firstOrManualScanFilter = or(toFirstScanFilter(), eq(scans.isManual, true))
	const waitingReasonFilter = or(
		isScheduledScansCutoffPassed ? firstOrManualScanFilter : undefined,
		isUnverifiedFirstScanLimitOn
			? and(firstOrManualScanFilter, toUnverifiedPasswordUserFilter(scans.ownerId))
			: undefined,
	)
	return and(
		eq(scans.status, "running"),
		isNull(scans.dispatchedAt),
		isNotNull(scans.topicId),
		sql`${scans.ownerId} in ${toPlanUserIdQuery("free")}`,
		waitingReasonFilter,
	) as SQL
}

/**
 * Whether a new first Scan of the owner waits for the first scan dispatch limit: a free owner who is not an admin, past
 * the scheduled scans cutoff, or an unverified password account while the switch is on.
 * A failed read is reported and waits for nothing.
 */
export async function isFirstScanWaiting(ownerId: string): Promise<boolean> {
	try {
		return await isFreeUserScanWaiting(ownerId)
	} catch (error) {
		// report a failed read, and start the first scan
		reportError(error, "first-scan", { ownerId })
		return false
	}
}

/**
 * Whether a manual Scan that bills the user waits for the first scan dispatch limit: a free user who is not an admin,
 * past the scheduled scans cutoff, or an unverified password account while the switch is on. A failed read is reported
 * and waits for nothing.
 */
export async function isManualScanWaiting(userId: string): Promise<boolean> {
	try {
		return await isFreeUserScanWaiting(userId)
	} catch (error) {
		reportError(error, "manual-scan", { userId })
		return false
	}
}

// whether a new first or manual Scan of the user waits. a failed read throws an error
async function isFreeUserScanWaiting(userId: string): Promise<boolean> {
	// only a free user who is not an admin ever waits
	if (!(await isFreeUser(userId))) {
		return false
	}

	// past the scheduled scans cutoff every free user's scan waits, and the switch adds an unverified password account's
	const cutoffState = await loadRequestDailySpendCutoffState()
	if (isDailySpendCutoffPassed(cutoffState, "scheduledScans")) {
		return true
	}
	return isUnverifiedPasswordUserLimited(cutoffState, userId)
}

/**
 * Whether the unverified accounts switch rejects the user's chat and voice requests: the switch is on, and the user is
 * free, not an admin, signed up with a password, and has not verified their email. A failed access read throws an
 * error.
 */
export async function isUnverifiedAccountLimited(userId: string): Promise<boolean> {
	// only a free user who is not an admin is ever limited
	if (!(await isFreeUser(userId))) {
		return false
	}
	return isUnverifiedPasswordUserLimited(await loadRequestDailySpendCutoffState(), userId)
}

// whether the unverified accounts switch is on and the user signed up with a password and has not verified their email
async function isUnverifiedPasswordUserLimited(cutoffState: DailySpendCutoffState, userId: string): Promise<boolean> {
	return isUnverifiedFirstScanLimitApplied(cutoffState) && (await isUnverifiedPasswordUser(userId))
}

/**
 * Whether the user is free and not an admin and the day's free-plan spend is past the cutoff. Only a free user reads the
 * cutoffs, and a failed access read throws an error.
 */
export async function isUserPastDailySpendCutoff(userId: string, kind: DailySpendCutoffKind): Promise<boolean> {
	return (await isFreeUser(userId)) && isDailySpendCutoffPassed(await loadRequestDailySpendCutoffState(), kind)
}

/**
 * Whether the Topic's first Scan is a waiting scan. Only the Topic of a free owner who is not an admin reads the
 * cutoffs.
 */
export async function isTopicFirstScanWaiting(topic: { id: string; ownerId: string }): Promise<boolean> {
	// a paid or admin owner's first scan never waits
	if (!(await isFreeUser(topic.ownerId))) {
		return false
	}

	// below the cutoff with the switch off nothing waits, so the Topic's scans are not read
	const cutoffState = await loadRequestDailySpendCutoffState()
	if (!isDailySpendCutoffPassed(cutoffState, "scheduledScans") && !isUnverifiedFirstScanLimitApplied(cutoffState)) {
		return false
	}

	// look for the Topic's waiting first scan
	const [waitingFirstScan] = await db
		.select({ id: scans.id })
		.from(scans)
		.where(and(eq(scans.topicId, topic.id), toFirstScanFilter(), toWaitingScanFilter(cutoffState)))
		.limit(1)
	return waitingFirstScan !== undefined
}

// whether the unverified accounts switch is on in a loaded state
function isUnverifiedFirstScanLimitApplied(cutoffState: DailySpendCutoffState): boolean {
	return cutoffState.status === "loaded" && cutoffState.settings.isUnverifiedFirstScanLimitOn
}

// whether the user is on the free plan and not an admin, from the access row read once per request
async function isFreeUser(userId: string): Promise<boolean> {
	const userAccess = await loadUserAccess(userId)
	return !userAccess.isAdmin && userAccess.plan === "free"
}

// whether the user signed up with a password and has not verified their email
async function isUnverifiedPasswordUser(userId: string): Promise<boolean> {
	const [unverifiedPasswordUser] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, userId), eq(users.emailVerified, false), toPasswordUserFilter(users.id)))
		.limit(1)
	return unverifiedPasswordUser !== undefined
}

// the filter that matches the owner of an account that signed up with a password and has not verified its email
function toUnverifiedPasswordUserFilter(userIdColumn: typeof scans.ownerId): SQL {
	return sql`${userIdColumn} in (select ${users.id} from ${users} where ${users.emailVerified} = false) and ${toPasswordUserFilter(userIdColumn)}`
}

// the filter that matches a user id with a password sign-in account
function toPasswordUserFilter(userIdColumn: typeof users.id | typeof scans.ownerId): SQL {
	return sql`exists (select 1 from ${accounts} where ${accounts.userId} = ${userIdColumn} and ${accounts.providerId} = ${PASSWORD_PROVIDER_ID})`
}
