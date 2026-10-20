// spokenQuestionsPaused tests: what a mic does past the spoken questions cutoff on each plan
import { expect, test } from "bun:test"
import { toSpokenQuestionsPausedAction } from "./spokenQuestionsPaused"

// premium has no plan above it, so each mic toasts when speaking comes back
test("a premium mic past the spoken questions cutoff toasts and stays on the page", () => {
	expect(toSpokenQuestionsPausedAction("premium", "chat-voice")).toEqual({
		kind: "toast",
		prompt: "Speak with Carl again on the 1st.",
	})
	expect(toSpokenQuestionsPausedAction("premium", "podcast-question")).toEqual({
		kind: "toast",
		prompt: "Speak with Carl and Vienna again on the 1st.",
	})
})

// free, plus, and a session with no plan yet open the plans page with the mic's call to action
test("a free or plus mic past the spoken questions cutoff opens the plans page", () => {
	expect(toSpokenQuestionsPausedAction("free", "chat-voice")).toEqual({
		kind: "navigate",
		navigation: { to: "/plans", search: { cta: "chat-voice" } },
	})
	expect(toSpokenQuestionsPausedAction("plus", "podcast-question")).toEqual({
		kind: "navigate",
		navigation: { to: "/plans", search: { cta: "podcast-question" } },
	})
	expect(toSpokenQuestionsPausedAction(undefined, "chat-voice")).toEqual({
		kind: "navigate",
		navigation: { to: "/plans", search: { cta: "chat-voice" } },
	})
})
