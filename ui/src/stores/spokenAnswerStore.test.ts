// the spoken answer queue: what it does next, how a failed spoken part, a prefetch, and the audio cache behave, how its
// end is announced, and how a stop keeps a streaming reply quiet
import { afterEach, expect, test } from "bun:test"
import type { VoiceChatPage } from "@shared/payloads"
import { type SpokenAnswerEnd, toNextSpokenPartAction } from "./spokenAnswerQueue"
import {
	appendSpokenAnswerPart,
	completeSpokenAnswer,
	registerSpokenAnswerAudio,
	speakSpokenAnswer,
	stopSpokenAnswer,
	stopSpokenAnswerKey,
	subscribeToSpokenAnswerEnd,
	toSpokenAnswerState,
} from "./spokenAnswerStore"

// the page every queue in these tests speaks on
const page: VoiceChatPage = { kind: "room", topicId: null, teamId: "team-a" }

// a fake audio element: its source, and each play's rejection, which a test calls to reject that play
type FakeAudioElement = EventTarget & { src: string; playRejections: ((error: Error) => void)[] }

// the calls that undo a test's fake element and stubbed fetch
const cleanups: (() => void)[] = []
afterEach(() => {
	stopSpokenAnswer()
	for (const cleanup of cleanups.splice(0)) {
		cleanup()
	}
})

// register a fake audio element with the store. each play stays pending until the test rejects it
function registerFakeAudioElement(): FakeAudioElement {
	const fakeAudioElement: FakeAudioElement = Object.assign(new EventTarget(), {
		src: "",
		playRejections: [] as ((error: Error) => void)[],
		play(): Promise<void> {
			return new Promise<void>((_, reject) => fakeAudioElement.playRejections.push(reject))
		},
		pause(): void {},
		load(): void {},
		removeAttribute(): void {
			fakeAudioElement.src = ""
		},
	})
	cleanups.push(registerSpokenAnswerAudio(fakeAudioElement as unknown as HTMLAudioElement))
	return fakeAudioElement
}

// stub the speech route with a status per spoken part's text, 200 by default, and return the texts and the speakers it
// was asked for. a 200 returns audio of the given size in bytes
function stubSpeechRoute(
	statusByText: Record<string, number>,
	audioByteCount = 4,
): { fetchedTexts: string[]; fetchedSpeakers: string[] } {
	// the stub reads the spoken part's text and speaker from the body and returns its status
	const fetchedTexts: string[] = []
	const fetchedSpeakers: string[] = []
	const originalFetch = globalThis.fetch
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		const { text, speaker } = JSON.parse(String(init.body)) as { text: string; speaker: string }
		fetchedTexts.push(text)
		fetchedSpeakers.push(speaker)

		// a 200 returns the audio, and any other status returns no body
		const status = statusByText[text] ?? 200
		return status === 200 ? new Response(new Uint8Array(audioByteCount)) : new Response(null, { status })
	}) as unknown as typeof fetch
	cleanups.push(() => {
		globalThis.fetch = originalFetch
	})
	return { fetchedTexts, fetchedSpeakers }
}

// let the queue's fetches and plays settle
async function flushQueue(): Promise<void> {
	for (let i = 0; i < 5; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}

// the queue plays what is appended, waits while the stream may add more, and finishes once it is complete
test("toNextSpokenPartAction plays, waits, or finishes", () => {
	expect(toNextSpokenPartAction({ spokenParts: ["a", "b"], nextSpokenPartIndex: 1, isComplete: false })).toBe("play")
	expect(toNextSpokenPartAction({ spokenParts: ["a"], nextSpokenPartIndex: 1, isComplete: false })).toBe("wait")
	expect(toNextSpokenPartAction({ spokenParts: ["a"], nextSpokenPartIndex: 1, isComplete: true })).toBe("finish")
	expect(toNextSpokenPartAction({ spokenParts: [], nextSpokenPartIndex: 0, isComplete: true })).toBe("finish")
})

// the end listeners learn which reply ended, whether carl finished it, and whether it was the conversation's own
test("subscribeToSpokenAnswerEnd tells a finished reply from a stopped one and a tapped one", async () => {
	const fakeAudioElement = registerFakeAudioElement()
	stubSpeechRoute({})
	const spokenAnswerEnds: SpokenAnswerEnd[] = []
	cleanups.push(subscribeToSpokenAnswerEnd((spokenAnswerEnd) => spokenAnswerEnds.push(spokenAnswerEnd)))

	// a one-spoken part reply the user plays by its button, which plays to its end
	speakSpokenAnswer({ spokenAnswerKey: "tapped", page, spokenParts: ["All of it."] })
	await flushQueue()
	fakeAudioElement.dispatchEvent(new Event("playing"))
	await flushQueue()
	fakeAudioElement.dispatchEvent(new Event("ended"))
	await flushQueue()
	expect(spokenAnswerEnds).toEqual([{ spokenAnswerKey: "tapped", isPlayedToEnd: true, isAutoPlayed: false }])

	// the conversation's own reply, stopped partway
	speakSpokenAnswer({ spokenAnswerKey: "stopped", page, spokenParts: ["Some of it."], isAutoPlayed: true })
	await flushQueue()
	stopSpokenAnswer()
	expect(spokenAnswerEnds[1]).toEqual({ spokenAnswerKey: "stopped", isPlayedToEnd: false, isAutoPlayed: true })

	// a streamed reply that queued nothing ends as finished, and one stopped before it queued ends as a stop
	completeSpokenAnswer("quiet")
	stopSpokenAnswerKey("never")
	expect(spokenAnswerEnds.slice(2)).toEqual([
		{ spokenAnswerKey: "quiet", isPlayedToEnd: true, isAutoPlayed: true },
		{ spokenAnswerKey: "never", isPlayedToEnd: false, isAutoPlayed: true },
	])

	// a stopped stream completing announces nothing more, and the conversation's reply with nothing to say finishes
	completeSpokenAnswer("never")
	speakSpokenAnswer({ spokenAnswerKey: "codeOnly", page, spokenParts: [], isAutoPlayed: true })
	expect(spokenAnswerEnds.slice(4)).toEqual([{ spokenAnswerKey: "codeOnly", isPlayedToEnd: true, isAutoPlayed: true }])
})

// a failed spoken part is skipped and the next one plays, and a spent budget stops the queue
test("a failed spoken part is skipped and a spent budget stops the queue", async () => {
	const fakeAudioElement = registerFakeAudioElement()
	const { fetchedTexts } = stubSpeechRoute({ "Skip one.": 502, "Skip three.": 402 })
	speakSpokenAnswer({
		spokenAnswerKey: "skip",
		page,
		spokenParts: ["Skip one.", "Skip two.", "Skip three.", "Skip four."],
	})
	await flushQueue()
	expect(fetchedTexts).toEqual(["Skip one.", "Skip two."])
	expect(fakeAudioElement.src).toStartWith("blob:")

	// the third spoken part's 402 stops the queue, so the fourth is never asked for
	fakeAudioElement.dispatchEvent(new Event("playing"))
	await flushQueue()
	fakeAudioElement.dispatchEvent(new Event("ended"))
	await flushQueue()
	expect(toSpokenAnswerState("skip")).toBe("idle")
	expect(fetchedTexts).not.toContain("Skip four.")
})

// a spoken part appended while the one before it plays is fetched at once, so carl never waits a whole speech call
test("appendSpokenAnswerPart prefetches a spoken part appended while one plays", async () => {
	const fakeAudioElement = registerFakeAudioElement()
	const { fetchedTexts } = stubSpeechRoute({})
	appendSpokenAnswerPart({ spokenAnswerKey: "prefetch", page, text: "Prefetch one." })
	await flushQueue()

	// the second spoken part arrives while the first plays
	fakeAudioElement.dispatchEvent(new Event("playing"))
	appendSpokenAnswerPart({ spokenAnswerKey: "prefetch", page, text: "Prefetch two." })
	await flushQueue()
	expect(fetchedTexts).toEqual(["Prefetch one.", "Prefetch two."])
})

// the cache is keyed on the spoken part's text, so the same spoken part in a reply with a new key is never fetched
// again
test("a spoken part's audio is cached by its text across reply keys", async () => {
	registerFakeAudioElement()
	const { fetchedTexts } = stubSpeechRoute({})
	speakSpokenAnswer({ spokenAnswerKey: "cache-a", page, spokenParts: ["Cached spoken part."] })
	await flushQueue()
	stopSpokenAnswer()

	// the replay under a new key reads the cache
	speakSpokenAnswer({ spokenAnswerKey: "cache-b", page, spokenParts: ["Cached spoken part."] })
	await flushQueue()
	expect(fetchedTexts).toEqual(["Cached spoken part."])
})

// the same words in vienna's voice are their own audio, fetched once with her speaker, and cached apart from carl's
test("a spoken part in another host's voice is fetched with its speaker and cached apart", async () => {
	registerFakeAudioElement()
	const { fetchedTexts, fetchedSpeakers } = stubSpeechRoute({})

	// carl's words, then the same words in vienna's voice, then vienna's again from the cache
	speakSpokenAnswer({ spokenAnswerKey: "voice-a", page, spokenParts: ["Same words."] })
	await flushQueue()
	stopSpokenAnswer()
	speakSpokenAnswer({ spokenAnswerKey: "voice-b", page, speaker: "cohost", spokenParts: ["Same words."] })
	await flushQueue()
	stopSpokenAnswer()
	speakSpokenAnswer({ spokenAnswerKey: "voice-c", page, speaker: "cohost", spokenParts: ["Same words."] })
	await flushQueue()

	// the words were fetched once in each voice
	expect(fetchedTexts).toEqual(["Same words.", "Same words."])
	expect(fetchedSpeakers).toEqual(["host", "cohost"])
})

// a stop from the lock screen or headphones says so to the end listeners, and a tap's stop does not
test("a lock screen pause is told apart from a tap's stop", async () => {
	registerFakeAudioElement()
	stubSpeechRoute({})
	const spokenAnswerEnds: SpokenAnswerEnd[] = []
	cleanups.push(subscribeToSpokenAnswerEnd((spokenAnswerEnd) => spokenAnswerEnds.push(spokenAnswerEnd)))

	// one reply paused from the lock screen, then one stopped by a tap
	speakSpokenAnswer({ spokenAnswerKey: "paused", page, spokenParts: ["Paused part."] })
	await flushQueue()
	stopSpokenAnswer({ isMediaSessionPause: true })
	speakSpokenAnswer({ spokenAnswerKey: "tapped", page, spokenParts: ["Tapped part."] })
	await flushQueue()
	stopSpokenAnswer()
	expect(spokenAnswerEnds.map((spokenAnswerEnd) => Boolean(spokenAnswerEnd.isMediaSessionPause))).toEqual([true, false])
})

// the cache drops its oldest spoken part once it holds more than its size, so that spoken part is fetched again
test("the audio cache drops its oldest spoken part past its size", async () => {
	registerFakeAudioElement()
	const { fetchedTexts } = stubSpeechRoute({}, 21_000_000)

	// two spoken parts fill the cache past its size, so the first is gone by the replay
	for (const text of ["Big one.", "Big two.", "Big one."]) {
		speakSpokenAnswer({ spokenAnswerKey: `big-${fetchedTexts.length}`, page, spokenParts: [text] })
		await flushQueue()
		stopSpokenAnswer()
	}
	expect(fetchedTexts).toEqual(["Big one.", "Big two.", "Big one."])
})

// a rejected play stops only the queue it belonged to, never the reply that replaced it
test("a rejected play leaves the queue that replaced it", async () => {
	const fakeAudioElement = registerFakeAudioElement()
	stubSpeechRoute({})
	speakSpokenAnswer({ spokenAnswerKey: "rejected-a", page, spokenParts: ["Rejected A."] })
	await flushQueue()

	// the second reply replaces the first, whose pending play is then rejected
	speakSpokenAnswer({ spokenAnswerKey: "rejected-b", page, spokenParts: ["Rejected B."] })
	await flushQueue()
	fakeAudioElement.playRejections[0]?.(new Error("interrupted"))
	await flushQueue()
	expect(toSpokenAnswerState("rejected-b")).toBe("loading")
})

// a streaming reply stopped by the user stays quiet after another reply is played and stopped
test("a stopped streaming reply stays quiet after another reply is played and stopped", () => {
	appendSpokenAnswerPart({ spokenAnswerKey: "streaming", page, text: "Streamed one." })
	stopSpokenAnswer()

	// another reply played and stopped, then the stopped stream's next spoken part
	speakSpokenAnswer({ spokenAnswerKey: "older", page, spokenParts: ["Older."] })
	stopSpokenAnswer()
	appendSpokenAnswerPart({ spokenAnswerKey: "streaming", page, text: "Streamed two." })
	expect(toSpokenAnswerState("streaming")).toBe("idle")
})

// a reply stopped before its first spoken part stays quiet, and another reply that is playing goes on
test("stopSpokenAnswerKey quiets a reply before its queue starts and leaves another reply", () => {
	speakSpokenAnswer({ spokenAnswerKey: "other", page, spokenParts: ["Other."] })
	stopSpokenAnswerKey("unstarted")
	appendSpokenAnswerPart({ spokenAnswerKey: "unstarted", page, text: "Quiet." })
	expect(toSpokenAnswerState("unstarted")).toBe("idle")
	expect(toSpokenAnswerState("other")).toBe("loading")
})

// a stop while the reply streams keeps its later spoken parts quiet, and a play tap on the reply speaks it again
test("appendSpokenAnswerPart stays quiet after a stop until the reply is played", () => {
	appendSpokenAnswerPart({ spokenAnswerKey: "a", page, text: "First." })
	expect(toSpokenAnswerState("a")).toBe("loading")
	stopSpokenAnswer()
	appendSpokenAnswerPart({ spokenAnswerKey: "a", page, text: "Second." })
	expect(toSpokenAnswerState("a")).toBe("idle")

	// a play tap on a reply with nothing to speak reports once and stays idle, and the reply may stream again
	const playingAts: (number | null)[] = []
	speakSpokenAnswer({
		spokenAnswerKey: "a",
		page,
		spokenParts: [],
		onFirstPlaying: (playingAt) => playingAts.push(playingAt),
	})
	expect(toSpokenAnswerState("a")).toBe("idle")
	expect(playingAts).toEqual([null])
	appendSpokenAnswerPart({ spokenAnswerKey: "a", page, text: "Third." })
	expect(toSpokenAnswerState("a")).toBe("loading")
	stopSpokenAnswer()
})
