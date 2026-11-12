// the spend control settings and the cutoff state that the daily spend cutoff tests share
import type { SpendControlSettings } from "@carlnotes/contracts/admin"
import type { DailySpendCutoffState } from "./dailySpendCutoffs"

// the built-in defaults, as the settings read them with no Doppler value
export const DEFAULT_SPEND_CONTROL_SETTINGS: SpendControlSettings = {
	podcastEpisodesCutoffCents: 6500,
	scheduledScansCutoffCents: 10_000,
	chatCutoffCents: 15_000,
	firstScanDispatchLimit: 5,
	hourlySignupAlertCount: 50,
	isUnverifiedFirstScanLimitOn: false,
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
