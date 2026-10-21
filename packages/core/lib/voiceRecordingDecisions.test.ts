// the voice recorder's decisions: the level of a frame, the meter's step, the silence threshold, the frame's decision,
// the container, and when the voice activity detector takes over
import { expect, test } from "bun:test"
import {
	toMeterLevel,
	toRecordingDecision,
	toRecordingLevel,
	toRecordingMimeType,
	toSilenceThreshold,
	toSpeechFrame,
} from "./voiceRecordingDecisions"

// silence sits at the midpoint and reads as zero, and a full swing reads as one
test("toRecordingLevel reads silence as zero and a full swing as one", () => {
	expect(toRecordingLevel(new Uint8Array([128, 128, 128, 128]))).toBe(0)
	expect(toRecordingLevel(new Uint8Array([0, 0, 0, 0]))).toBe(1)
	expect(toRecordingLevel(new Uint8Array([]))).toBe(0)

	// a half swing reads as a half
	expect(toRecordingLevel(new Uint8Array([64, 192, 64, 192]))).toBeCloseTo(0.5)
})

// the meter scales speech to full and draws twenty steps, so nearby levels draw the same step and never re-render
test("toMeterLevel scales the level into twenty steps", () => {
	expect(toMeterLevel(0)).toBe(0)
	expect(toMeterLevel(0.1)).toBe(0.3)
	expect(toMeterLevel(0.101)).toBe(toMeterLevel(0.1))
	expect(toMeterLevel(0.5)).toBe(1)
})

// the silence threshold sits a margin above the room, and never under the minimum a quiet room would put it at
test("toQuietFloor keeps a margin above the room and a fixed minimum", () => {
	expect(toSilenceThreshold(0)).toBe(0.02)
	expect(toSilenceThreshold(0.005)).toBe(0.02)
	expect(toSilenceThreshold(0.1)).toBeCloseTo(0.16)
})

// a frame's decision: keep while speaking, send once the speaker stops, cancel if nobody spoke, send at the limit
test("toRecordingDecision sends after the speaker stops and cancels with no speech", () => {
	const startedAt = 1_000_000
	// nobody has spoken yet, inside the first seconds
	expect(
		toRecordingDecision({ hasSpeechStarted: false, lastLoudAt: startedAt, startedAt, now: startedAt + 7_999 }),
	).toBe("keep")
	expect(
		toRecordingDecision({ hasSpeechStarted: false, lastLoudAt: startedAt, startedAt, now: startedAt + 8_000 }),
	).toBe("cancel")

	// speech started, and the speaker has been quiet for less than, then at least, the end of speech
	const lastLoudAt = startedAt + 3_000
	expect(toRecordingDecision({ hasSpeechStarted: true, lastLoudAt, startedAt, now: lastLoudAt + 1_499 })).toBe("keep")
	expect(toRecordingDecision({ hasSpeechStarted: true, lastLoudAt, startedAt, now: lastLoudAt + 1_500 })).toBe("send")

	// the limit sends whatever was recorded, even mid-sentence
	expect(
		toRecordingDecision({ hasSpeechStarted: true, lastLoudAt: startedAt + 59_900, startedAt, now: startedAt + 60_000 }),
	).toBe("send")
})

// the first supported container wins, opus in webm before mp4, and none leaves the browser's default
test("toRecordingMimeType takes the first container the browser supports", () => {
	expect(toRecordingMimeType(() => true)).toBe("audio/webm;codecs=opus")
	expect(toRecordingMimeType((mimeType) => mimeType === "audio/mp4")).toBe("audio/mp4")
	expect(toRecordingMimeType(() => false)).toBeUndefined()
})

// before the detector listens a loud frame is speech, and once it listens its own speech start and end decide, and the
// level's silence never ends the recording
test("toSpeechFrame reads the level until the detector listens, then the detector", () => {
	const notListeningVoiceActivityProgress = { isListening: false, hasSpeechStarted: false, isSpeechEnded: false }
	expect(
		toSpeechFrame({
			level: 0.2,
			silenceThreshold: 0.05,
			hasSpeechStarted: false,
			hasLevelSpeechBeforeListening: false,
			voiceActivityProgress: notListeningVoiceActivityProgress,
		}),
	).toEqual({ isSpeechEnded: false, hasSpeechStarted: true, isLoud: true })
	expect(
		toSpeechFrame({
			level: 0.01,
			silenceThreshold: 0.05,
			hasSpeechStarted: true,
			hasLevelSpeechBeforeListening: false,
			voiceActivityProgress: notListeningVoiceActivityProgress,
		}),
	).toEqual({ isSpeechEnded: false, hasSpeechStarted: true, isLoud: false })

	// the detector heard a blip it took back, so speech has not started, and a quiet frame still holds silence off
	const listeningVoiceActivityProgress = { isListening: true, hasSpeechStarted: false, isSpeechEnded: false }
	expect(
		toSpeechFrame({
			level: 0.01,
			silenceThreshold: 0.05,
			hasSpeechStarted: true,
			hasLevelSpeechBeforeListening: false,
			voiceActivityProgress: listeningVoiceActivityProgress,
		}),
	).toEqual({ isSpeechEnded: false, hasSpeechStarted: false, isLoud: true })

	// speech the level heard before the detector listened still ends on the level's silence, until the detector hears
	// speech of its own
	expect(
		toSpeechFrame({
			level: 0.01,
			silenceThreshold: 0.05,
			hasSpeechStarted: true,
			hasLevelSpeechBeforeListening: true,
			voiceActivityProgress: listeningVoiceActivityProgress,
		}),
	).toEqual({ isSpeechEnded: false, hasSpeechStarted: true, isLoud: false })
	const speakingVoiceActivityProgress = { isListening: true, hasSpeechStarted: true, isSpeechEnded: false }
	expect(
		toSpeechFrame({
			level: 0.01,
			silenceThreshold: 0.05,
			hasSpeechStarted: true,
			hasLevelSpeechBeforeListening: true,
			voiceActivityProgress: speakingVoiceActivityProgress,
		}),
	).toEqual({ isSpeechEnded: false, hasSpeechStarted: true, isLoud: true })

	// the detector heard the speech end
	const endedVoiceActivityProgress = { isListening: true, hasSpeechStarted: true, isSpeechEnded: true }
	expect(
		toSpeechFrame({
			level: 0.3,
			silenceThreshold: 0.05,
			hasSpeechStarted: true,
			hasLevelSpeechBeforeListening: false,
			voiceActivityProgress: endedVoiceActivityProgress,
		}).isSpeechEnded,
	).toBe(true)
})
