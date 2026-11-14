// the spend control draft as the console's read builds it, and the save body a draft sends, which holds only the
// settings this tab changed since it loaded or last saved, each checked against the save contract's bounds

import { expect, test } from "bun:test"
import type { AdminDailySpendCutoffs } from "@carlnotes/contracts/admin"
import type { SpendControlSettingsPayload } from "@carlnotes/contracts/payloads"
import {
	EMPTY_CUTOFF_DOLLAR_TEXTS,
	type SpendControlDraft,
	toSpendControlDraft,
	toSpendControlSettingsPayload,
} from "./spendControlDraft"

// a draft with every field at its default and every switch off
const DEFAULT_DRAFT: SpendControlDraft = {
	cutoffDollarTexts: EMPTY_CUTOFF_DOLLAR_TEXTS,
	dispatchLimitText: "",
	signupAlertText: "",
	generatedChapterImageLimitText: "",
	isUnverifiedFirstScanLimitOn: false,
	isPodcastEpisodeRecordingPaused: false,
	isTopicPodcastEpisodeVideoRenderingPaused: false,
	isHomePinnedOnly: false,
}

// the console's read with every setting at its default and every switch off
const DEFAULT_DAILY_SPEND_CUTOFFS: AdminDailySpendCutoffs = {
	freePlanSpendCents: 0,
	worstCaseMonthlySpend: { freeUserBudgetCents: 0, dailySignupCounts: [] },
	cutoffs: [
		{ kind: "podcastEpisodes", value: 6_500, defaultValue: 6_500, isOverridden: false, isPassed: false },
		{ kind: "scheduledScans", value: 10_000, defaultValue: 10_000, isOverridden: false, isPassed: false },
		{ kind: "chat", value: 15_000, defaultValue: 15_000, isOverridden: false, isPassed: false },
	],
	firstScanDispatchLimit: { value: 5, defaultValue: 5, isOverridden: false },
	waitingScanCount: 0,
	hourlySignupAlertCount: { value: 50, defaultValue: 50, isOverridden: false },
	hourlySignupCount: 0,
	generatedChapterImageLimit: { value: 40, defaultValue: 40, isOverridden: false },
	isUnverifiedFirstScanLimitOn: false,
	isPodcastEpisodeRecordingPaused: false,
	isTopicPodcastEpisodeVideoRenderingPaused: false,
	isHomePinnedOnly: false,
	updatedAt: null,
	updatedByUsername: null,
}

// the save body of a tab that loaded the default draft and changed the given fields
function toChangedFieldsPayload(changedFields: Partial<SpendControlDraft>): SpendControlSettingsPayload | null {
	return toSpendControlSettingsPayload({ draft: { ...DEFAULT_DRAFT, ...changedFields }, savedDraft: DEFAULT_DRAFT })
}

// the console's read with every default builds the default draft, each field empty and each switch off
test("the draft is empty and every switch is off for a read with every default", () => {
	expect(toSpendControlDraft(DEFAULT_DAILY_SPEND_CUTOFFS)).toEqual(DEFAULT_DRAFT)
})

// an image limit override fills its field, a default leaves it empty, and each switch reads as the console returned it
test("the draft is built from the read's image limit override, each pause, and the pinned-only home", () => {
	const spendControlDraft = toSpendControlDraft({
		...DEFAULT_DAILY_SPEND_CUTOFFS,
		generatedChapterImageLimit: { value: 10, defaultValue: 40, isOverridden: true },
		isPodcastEpisodeRecordingPaused: true,
		isTopicPodcastEpisodeVideoRenderingPaused: true,
		isHomePinnedOnly: true,
	})
	expect(spendControlDraft).toEqual({
		...DEFAULT_DRAFT,
		generatedChapterImageLimitText: "10",
		isPodcastEpisodeRecordingPaused: true,
		isTopicPodcastEpisodeVideoRenderingPaused: true,
		isHomePinnedOnly: true,
	})
})

// a typed field sends its number, a zero included, and a flipped switch sends as it is set
test("the save body sends each setting this tab changed", () => {
	const savePayload = toChangedFieldsPayload({
		cutoffDollarTexts: { ...EMPTY_CUTOFF_DOLLAR_TEXTS, scheduledScans: "42.5" },
		dispatchLimitText: "0",
		generatedChapterImageLimitText: "0",
		isUnverifiedFirstScanLimitOn: true,
		isHomePinnedOnly: true,
	})
	expect(savePayload).toStrictEqual({
		scheduledScansCutoffDollars: 42.5,
		firstScanDispatchLimit: 0,
		generatedChapterImageLimit: 0,
		isUnverifiedFirstScanLimitOn: true,
		isHomePinnedOnly: true,
	})
})

// a tab that loaded before another tab changed a cutoff, a limit, or a switch saves one setting, and its save names no
// other setting, so each keeps its stored value
test("the save body leaves out every setting this tab did not change", () => {
	expect(toChangedFieldsPayload({ dispatchLimitText: "3" })).toStrictEqual({ firstScanDispatchLimit: 3 })
	expect(toChangedFieldsPayload({ isPodcastEpisodeRecordingPaused: true })).toStrictEqual({
		isPodcastEpisodeRecordingPaused: true,
	})
})

// a draft the tab did not change, and a field retyped as the same number, have nothing to send
test("the save body holds no setting for a draft that changed none", () => {
	expect(toChangedFieldsPayload({})).toStrictEqual({})
	const savedDraft = { ...DEFAULT_DRAFT, signupAlertText: "80" }
	const retypedDraft = { ...savedDraft, signupAlertText: "80.0" }
	expect(toSpendControlSettingsPayload({ draft: retypedDraft, savedDraft })).toStrictEqual({})
})

// a setting this tab saved is part of its saved draft, so the next save leaves it out, and a later change sends it
test("the save body compares against the draft this tab last saved", () => {
	// this tab paused podcast episodes and set an image limit of 10, and both saved
	const savedDraft = { ...DEFAULT_DRAFT, isPodcastEpisodeRecordingPaused: true, generatedChapterImageLimitText: "10" }

	// a signup alert saved next names neither
	const alertDraft = { ...savedDraft, signupAlertText: "80" }
	expect(toSpendControlSettingsPayload({ draft: alertDraft, savedDraft })).toStrictEqual({ hourlySignupAlertCount: 80 })

	// the pause turned back off and the image limit emptied are both sent, the emptied limit as null
	const revertedDraft = { ...savedDraft, isPodcastEpisodeRecordingPaused: false, generatedChapterImageLimitText: "" }
	expect(toSpendControlSettingsPayload({ draft: revertedDraft, savedDraft })).toStrictEqual({
		generatedChapterImageLimit: null,
		isPodcastEpisodeRecordingPaused: false,
	})
})

// a value past the contract's upper bound, below its lower bound, a fraction, or text is never sent
test("the save body is null for a value outside the contract's bounds", () => {
	expect(toChangedFieldsPayload({ dispatchLimitText: "10001" })).toBeNull()
	expect(toChangedFieldsPayload({ signupAlertText: "0" })).toBeNull()
	expect(toChangedFieldsPayload({ dispatchLimitText: "1.5" })).toBeNull()
	expect(toChangedFieldsPayload({ generatedChapterImageLimitText: "-1" })).toBeNull()
	expect(toChangedFieldsPayload({ generatedChapterImageLimitText: "1001" })).toBeNull()
	expect(toChangedFieldsPayload({ cutoffDollarTexts: { ...EMPTY_CUTOFF_DOLLAR_TEXTS, chat: "abc" } })).toBeNull()
})
