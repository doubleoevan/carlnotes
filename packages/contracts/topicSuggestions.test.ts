// every textual choice corresponds to the same group and action as the MCP view
import { expect, test } from "bun:test"
import { toTopicSuggestionsText } from "./topicSuggestions"

test("text-only hosts receive editable destinations and the persistent new-Topic action without follow choices", () => {
	const text = toTopicSuggestionsText({
		status: "suggested",
		editableTopics: [
			{
				id: "editable",
				name: "Evals",
				prompt: "Evals",
				url: "https://carlnotes.com/topics/editable",
				group: "editable",
				relevance: 0.9,
				isBestMatch: true,
			},
		],
		publicTopicsToFollow: [
			{
				id: "public",
				name: "Benchmarks",
				prompt: "Benchmarks",
				url: "https://carlnotes.com/topics/public",
				group: "public_to_follow",
				relevance: 0.8,
			},
		],
		nextCursor: "next-page",
		newPrivateTopic: { label: "Start a new topic for this chat", instructions: "Create only after confirmation." },
	})
	expect(text).toContain("1. Evals (best match)")
	expect(text).not.toContain("Benchmarks")
	expect(text).toContain("2. Start a new topic for this chat")
	expect(text).toContain("Create only after confirmation")
	expect(text).not.toContain("Public topics to follow")
	expect(text).toContain("cursor next-page")
})
