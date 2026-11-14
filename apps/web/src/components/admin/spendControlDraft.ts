// the spend control section's typed overrides: the draft as the console loaded it, each cutoff's typed value in cents,
// and the save body a draft sends, which holds only the settings this tab changed

import type { AdminDailySpendCutoffs, AdminSpendControlSetting, DailySpendCutoffKind } from "@carlnotes/contracts/admin"
import { type SpendControlSettingsPayload, spendControlSettingsPayload } from "@carlnotes/contracts/payloads"
import { toCentsFromDollars } from "@carlnotes/contracts/plans"

// one daily spend cutoff as the console reads it
export type AdminDailySpendCutoff = AdminDailySpendCutoffs["cutoffs"][number]

// the typed overrides and the switches, each override empty while its setting reads its default
export type SpendControlDraft = {
	cutoffDollarTexts: Record<DailySpendCutoffKind, string>
	dispatchLimitText: string
	signupAlertText: string
	generatedChapterImageLimitText: string
	// the unverified accounts switch, the two pauses, and the pinned-only home
	isUnverifiedFirstScanLimitOn: boolean
	isPodcastEpisodeRecordingPaused: boolean
	isTopicPodcastEpisodeVideoRenderingPaused: boolean
	isHomePinnedOnly: boolean
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

	// the counts' overrides and the switches
	return {
		cutoffDollarTexts,
		dispatchLimitText: toOverrideText(dailySpendCutoffs.firstScanDispatchLimit),
		signupAlertText: toOverrideText(dailySpendCutoffs.hourlySignupAlertCount),
		generatedChapterImageLimitText: toOverrideText(dailySpendCutoffs.generatedChapterImageLimit),
		isUnverifiedFirstScanLimitOn: dailySpendCutoffs.isUnverifiedFirstScanLimitOn,
		isPodcastEpisodeRecordingPaused: dailySpendCutoffs.isPodcastEpisodeRecordingPaused,
		isTopicPodcastEpisodeVideoRenderingPaused: dailySpendCutoffs.isTopicPodcastEpisodeVideoRenderingPaused,
		isHomePinnedOnly: dailySpendCutoffs.isHomePinnedOnly,
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

// the draft to save, and the draft this tab loaded or last saved
type ToSpendControlSettingsPayloadOptions = { draft: SpendControlDraft; savedDraft: SpendControlDraft }

/**
 * Returns the save body of a draft: each setting the draft changed from the saved draft, with null for an emptied
 * field, and no setting if the draft changed none. A setting left out keeps its stored value. Returns null if a
 * changed value is outside the contract's range.
 */
export function toSpendControlSettingsPayload({
	draft,
	savedDraft,
}: ToSpendControlSettingsPayloadOptions): SpendControlSettingsPayload | null {
	// read each setting from both drafts
	const draftSettings = toSpendControlDraftSettings(draft)
	const savedDraftSettings = toSpendControlDraftSettings(savedDraft)

	// keep each setting the draft changed
	const changedSettings: Partial<SpendControlDraftSettings> = {}
	for (const settingName of spendControlSettingsPayload.keyof().options) {
		if (draftSettings[settingName] !== savedDraftSettings[settingName]) {
			changedSettings[settingName] = draftSettings[settingName]
		}
	}

	// check each changed value against the save contract's bounds
	const payloadParse = spendControlSettingsPayload.safeParse(changedSettings)
	return payloadParse.success ? payloadParse.data : null
}

// every setting of the save body as a draft holds it: a number that may be outside the contract's range, null for an
// empty field, or a switch
type SpendControlDraftSettings = Record<keyof SpendControlSettingsPayload, number | boolean | null>

// read every setting of the save body from a draft
function toSpendControlDraftSettings(draft: SpendControlDraft): SpendControlDraftSettings {
	return {
		podcastEpisodesCutoffDollars: toFieldNumber(draft.cutoffDollarTexts.podcastEpisodes),
		scheduledScansCutoffDollars: toFieldNumber(draft.cutoffDollarTexts.scheduledScans),
		chatCutoffDollars: toFieldNumber(draft.cutoffDollarTexts.chat),
		firstScanDispatchLimit: toFieldNumber(draft.dispatchLimitText),
		hourlySignupAlertCount: toFieldNumber(draft.signupAlertText),
		generatedChapterImageLimit: toFieldNumber(draft.generatedChapterImageLimitText),
		isUnverifiedFirstScanLimitOn: draft.isUnverifiedFirstScanLimitOn,
		isPodcastEpisodeRecordingPaused: draft.isPodcastEpisodeRecordingPaused,
		isTopicPodcastEpisodeVideoRenderingPaused: draft.isTopicPodcastEpisodeVideoRenderingPaused,
		isHomePinnedOnly: draft.isHomePinnedOnly,
	}
}

// a numeric setting's override as text, or empty where the default is in effect
function toOverrideText(setting: AdminSpendControlSetting): string {
	return setting.isOverridden ? String(setting.value) : ""
}

// a field's number, NaN for text that is not one, or null for an empty field
function toFieldNumber(text: string): number | null {
	return text.trim() === "" ? null : Number(text)
}
