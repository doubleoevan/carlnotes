// the spend control settings, the stored overrides row, and the cutoff state that the daily spend cutoff tests share
import type { SpendControlSettings } from "@carlnotes/contracts/admin"
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
	isTopicPodcastEpisodeVideoRenderingPaused: false,
	isHomePinnedOnly: false,
}

// the overrides a stored settings row sets: the chat cutoff in cents, and the unverified accounts switch
type SpendControlOverridesRowOptions = { chatCutoffCents?: number | null; isUnverifiedFirstScanLimitOn?: boolean }

/**
 * Returns the stored overrides row in the column order the settings read selects: the five numeric overrides, the
 * unverified accounts switch, the generated chapter image limit, the two pauses, and the pinned-only home. The row has
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
