// voiceRecordingRules tests: the spoken questions read that stops a reopened recording, and the timer and the meter
// that only a composer's recording bar shows
import { expect, test } from "bun:test"
import { isRecordingTimerTicking, toLevelCallback, toReopenedRecordingRejection } from "./voiceRecordingRules"

// a reopened recording that is still the current one stops for a spent budget or the cutoff, wherever it has got to
test("a budget or a pause read while the reopened recording runs stops it", () => {
	for (const state of ["requesting", "recording", "transcribing"] as const) {
		expect(toReopenedRecordingRejection({ spokenQuestionsStatus: "budget", isSameRecording: true, state })).toBe(
			"budget",
		)
		expect(toReopenedRecordingRejection({ spokenQuestionsStatus: "paused", isSameRecording: true, state })).toBe(
			"spokenQuestionsPaused",
		)
	}
})

// speaking that is allowed keeps the reopened recording
test("an allowed read keeps the reopened recording", () => {
	expect(
		toReopenedRecordingRejection({ spokenQuestionsStatus: "allowed", isSameRecording: true, state: "recording" }),
	).toBeNull()
})

// a read that returns after the recording ended or gave way to a newer one leaves the mic alone
test("a late read leaves an ended or newer recording alone", () => {
	expect(
		toReopenedRecordingRejection({ spokenQuestionsStatus: "budget", isSameRecording: false, state: "recording" }),
	).toBeNull()
	expect(
		toReopenedRecordingRejection({ spokenQuestionsStatus: "paused", isSameRecording: true, state: "idle" }),
	).toBeNull()
})

// the seconds timer ticks only while a composer records, and the podcast mic shows none
test("the timer ticks only while a composer records", () => {
	expect(isRecordingTimerTicking({ state: "recording", isPodcastEpisodeQuestion: false })).toBe(true)
	expect(isRecordingTimerTicking({ state: "recording", isPodcastEpisodeQuestion: true })).toBe(false)
	for (const state of ["idle", "requesting", "transcribing"] as const) {
		expect(isRecordingTimerTicking({ state, isPodcastEpisodeQuestion: false })).toBe(false)
	}
})

// a composer's meter takes each level, and the podcast mic's recording never sets one
test("only a composer's recording sets the meter", () => {
	// record each level the meter's setter receives
	const meterLevels: number[] = []
	const setLevel = (meterLevel: number): void => {
		meterLevels.push(meterLevel)
	}

	// the podcast mic ignores the level, and a composer's setter receives it
	toLevelCallback({ isPodcastEpisodeQuestion: true, setLevel })(0.5)
	expect(meterLevels).toEqual([])
	toLevelCallback({ isPodcastEpisodeQuestion: false, setLevel })(0.75)
	expect(meterLevels).toEqual([0.75])
})
