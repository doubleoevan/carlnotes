// the spend control settings, the stored overrides rows, the Doppler setting names, the cutoff state, and the stubbed
// cutoff reads that the daily spend cutoff tests share
import type { SpendControlSettings } from "@carlnotes/contracts/admin"
import { FREE_USER_ACCESS_ROW, stubConnectionPool } from "./connectionPoolStub"
import type { DailySpendCutoffState } from "./dailySpendCutoffs"

// the built-in defaults, as the settings read them with no Doppler value
export const DEFAULT_SPEND_CONTROL_SETTINGS: SpendControlSettings = {
	podcastEpisodesCutoffCents: 6500,
	scheduledScansCutoffCents: 10_000,
	chatCutoffCents: 15_000,
	firstScanDispatchLimit: 5,
	hourlySignupAlertCount: 50,
	generatedChapterImageLimit: 40,
	isUnverifiedFirstScanLimitOn: false,
	isPodcastEpisodeRecordingPaused: false,
	isTopicVideoRenderingPaused: false,
	isHomeFeaturedOnly: false,
}

// the overrides a stored settings row sets: the chat cutoff in cents, and the unverified accounts switch
type SpendControlOverridesRowOptions = { chatCutoffCents?: number | null; isUnverifiedFirstScanLimitOn?: boolean }

/**
 * Returns the stored overrides row in the column order the settings read selects: the five numeric overrides, the
 * unverified accounts switch, the generated chapter image limit, the two pauses, and the featured-only home. The row has
 * no override and every switch off, but for the chat cutoff and the unverified accounts switch a test gives.
 */
export function toSpendControlOverridesRow({
	chatCutoffCents = null,
	isUnverifiedFirstScanLimitOn = false,
}: SpendControlOverridesRowOptions = {}): unknown[] {
	return [null, null, chatCutoffCents, null, null, isUnverifiedFirstScanLimitOn, null, false, false, false]
}

/**
 * Returns a loaded cutoff state at the free-plan spend, over the default settings with the given ones replaced.
 */
export function toDailySpendCutoffState(
	freePlanSpendCents: number,
	settings: Partial<SpendControlSettings> = {},
): DailySpendCutoffState {
	return { status: "loaded", freePlanSpendCents, settings: { ...DEFAULT_SPEND_CONTROL_SETTINGS, ...settings } }
}

// the stored overrides row with no override, and the same row with the unverified accounts switch on
export const EMPTY_OVERRIDES_ROW = toSpendControlOverridesRow()
export const UNVERIFIED_SWITCH_ON_ROW = toSpendControlOverridesRow({ isUnverifiedFirstScanLimitOn: true })

// the six Doppler settings the defaults read
export const SPEND_CONTROL_ENV_NAMES = [
	"PODCAST_EPISODES_DAILY_SPEND_CUTOFF_USD",
	"SCHEDULED_SCANS_DAILY_SPEND_CUTOFF_USD",
	"CHAT_DAILY_SPEND_CUTOFF_USD",
	"FIRST_SCAN_DISPATCH_LIMIT",
	"HOURLY_SIGNUP_ALERT_COUNT",
	"TOPIC_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT",
] as const

// the rows the stubbed database returns: the access row, the overrides, the day's spend, and the unverified check
type CutoffQueryRows = {
	accessRow?: unknown[]
	overridesRow?: unknown[]
	scanSpendDollars?: string
	isUnverifiedPasswordUser?: boolean
}

/**
 * Stubs the database with the rows each cutoff read sends, and returns the queries it was sent.
 */
export function stubCutoffQueries({
	accessRow = FREE_USER_ACCESS_ROW,
	overridesRow = EMPTY_OVERRIDES_ROW,
	scanSpendDollars = "0",
	isUnverifiedPasswordUser = false,
}: CutoffQueryRows): ReturnType<typeof stubConnectionPool> {
	return stubConnectionPool(({ text }) => {
		// the unverified check and the access row both read users, so the unverified check is told apart first
		if (text.includes('"email_verified"')) {
			return isUnverifiedPasswordUser ? [["user-1"]] : []
		}

		// the overrides, and the spend sums with the scan spend given
		if (text.includes('from "spend_control_settings"')) {
			return [overridesRow]
		}
		if (text.includes("coalesce(sum(")) {
			return [[text.includes('from "scans"') ? scanSpendDollars : "0"]]
		}

		// the access row for any other read
		return [accessRow]
	})
}
