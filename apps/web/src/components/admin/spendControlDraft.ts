// the spend control section's typed overrides: the draft as the console loaded it, each cutoff's typed value in cents,
// and the save body the draft sends

import type { AdminDailySpendCutoffs, AdminSpendControlSetting, DailySpendCutoffKind } from "@carlnotes/contracts/admin"
import { type SpendControlSettingsPayload, spendControlSettingsPayload } from "@carlnotes/contracts/payloads"
import { toCentsFromDollars } from "@carlnotes/contracts/plans"

// one daily spend cutoff as the console reads it
export type AdminDailySpendCutoff = AdminDailySpendCutoffs["cutoffs"][number]

// the typed overrides and the switch, each override empty while its setting reads its default
export type SpendControlDraft = {
	cutoffDollarTexts: Record<DailySpendCutoffKind, string>
	dispatchLimitText: string
	signupAlertText: string
	isUnverifiedFirstScanLimitOn: boolean
}

// every cutoff's text emptied, so each reads its default
export const EMPTY_CUTOFF_DOLLAR_TEXTS: Record<DailySpendCutoffKind, string> = Object.freeze({
	podcastEpisodes: "",
	scheduledScans: "",
	chat: "",
})

/**
 * Returns the typed overrides as the console loaded them, each empty where the default is in effect.
 */
export function toSpendControlDraft(dailySpendCutoffs: AdminDailySpendCutoffs): SpendControlDraft {
	// each cutoff's override in dollars
	const cutoffDollarTexts = { ...EMPTY_CUTOFF_DOLLAR_TEXTS }
	for (const cutoff of dailySpendCutoffs.cutoffs) {
		cutoffDollarTexts[cutoff.kind] = cutoff.isOverridden ? String(cutoff.value / 100) : ""
	}

	// the counts' overrides and the switch
	return {
		cutoffDollarTexts,
		dispatchLimitText: toOverrideText(dailySpendCutoffs.firstScanDispatchLimit),
		signupAlertText: toOverrideText(dailySpendCutoffs.hourlySignupAlertCount),
		isUnverifiedFirstScanLimitOn: dailySpendCutoffs.isUnverifiedFirstScanLimitOn,
	}
}

/**
 * Returns a cutoff's typed value in cents: its default for an empty field, and its saved value for a value out of range.
 */
export function toDraftCutoffCents(cutoff: AdminDailySpendCutoff, text: string): number {
	const dollars = toFieldNumber(text)
	if (dollars === null) {
		return cutoff.defaultValue
	}
	return dollars >= 0.01 ? toCentsFromDollars(dollars) : cutoff.value
}

/**
 * Returns the save body from the draft, with null for an empty field, or null if a value is outside the contract's range.
 */
export function toSpendControlSettingsPayload(draft: SpendControlDraft): SpendControlSettingsPayload | null {
	// read each field, null for an empty one, and check every value against the save contract's bounds
	const payloadParse = spendControlSettingsPayload.safeParse({
		podcastEpisodesCutoffDollars: toFieldNumber(draft.cutoffDollarTexts.podcastEpisodes),
		scheduledScansCutoffDollars: toFieldNumber(draft.cutoffDollarTexts.scheduledScans),
		chatCutoffDollars: toFieldNumber(draft.cutoffDollarTexts.chat),
		firstScanDispatchLimit: toFieldNumber(draft.dispatchLimitText),
		hourlySignupAlertCount: toFieldNumber(draft.signupAlertText),
		isUnverifiedFirstScanLimitOn: draft.isUnverifiedFirstScanLimitOn,
	})
	return payloadParse.success ? payloadParse.data : null
}

// a numeric setting's override as text, or empty where the default is in effect
function toOverrideText(setting: AdminSpendControlSetting): string {
	return setting.isOverridden ? String(setting.value) : ""
}

// a field's number, NaN for text that is not one, or null for an empty field
function toFieldNumber(text: string): number | null {
	return text.trim() === "" ? null : Number(text)
}
