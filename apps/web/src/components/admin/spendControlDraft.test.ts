// the save body the spend control draft sends, checked against the save contract's bounds

import { expect, test } from "bun:test"
import { EMPTY_CUTOFF_DOLLAR_TEXTS, type SpendControlDraft, toSpendControlSettingsPayload } from "./spendControlDraft"

// a draft with every field at its default and the switch off
const DEFAULT_DRAFT: SpendControlDraft = {
	cutoffDollarTexts: EMPTY_CUTOFF_DOLLAR_TEXTS,
	dispatchLimitText: "",
	signupAlertText: "",
	isUnverifiedFirstScanLimitOn: false,
}

// empty fields send null, and typed fields send their numbers
test("the save body sends null for an empty field and the number for a typed one", () => {
	expect(toSpendControlSettingsPayload({ ...DEFAULT_DRAFT, dispatchLimitText: "0" })).toEqual({
		podcastEpisodesCutoffDollars: null,
		scheduledScansCutoffDollars: null,
		chatCutoffDollars: null,
		firstScanDispatchLimit: 0,
		hourlySignupAlertCount: null,
		isUnverifiedFirstScanLimitOn: false,
	})
})

// a value past the contract's upper bound, below its lower bound, a fraction, or text is never sent
test("the save body is null for a value outside the contract's bounds", () => {
	expect(toSpendControlSettingsPayload({ ...DEFAULT_DRAFT, dispatchLimitText: "10001" })).toBeNull()
	expect(toSpendControlSettingsPayload({ ...DEFAULT_DRAFT, signupAlertText: "0" })).toBeNull()
	expect(toSpendControlSettingsPayload({ ...DEFAULT_DRAFT, dispatchLimitText: "1.5" })).toBeNull()
	expect(
		toSpendControlSettingsPayload({
			...DEFAULT_DRAFT,
			cutoffDollarTexts: { ...EMPTY_CUTOFF_DOLLAR_TEXTS, chat: "abc" },
		}),
	).toBeNull()
})
