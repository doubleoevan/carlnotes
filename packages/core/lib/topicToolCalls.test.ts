import { expect, test } from "bun:test"
import { CHAT_REJECTION_COPY, toChatTopicLimitCopy } from "./chatRejectionCopy"
import { applyTopicEditToolCalls, showTopicToolCalls, toProposedTopicEdit } from "./topicToolCalls"

// preview first, then cancel or settle accepted saves through the same callbacks
test("topic edits preview, cancel, and reload only through supplied effects", () => {
	const transitions: unknown[] = []
	const effects = {
		topicId: "topic-1",
		onStartEditingTopic: (...values: unknown[]) => {
			transitions.push(values)
		},
		onClearProposedTopicEdit: () => {
			transitions.push("clear")
		},
	}
	applyTopicEditToolCalls({
		...effects,
		toolCalls: { proposedTopicEdit: { tags: ["news"] }, isTopicEditCancelled: false, topicSaves: [] },
	})
	expect(transitions).toEqual([["topic-1", { tags: ["news"] }]])
	applyTopicEditToolCalls({
		...effects,
		toolCalls: { isTopicEditCancelled: true, topicSaves: [] },
	})
	applyTopicEditToolCalls({
		...effects,
		toolCalls: { isTopicEditCancelled: false, topicSaves: ["Saved."] },
	})
	expect(transitions.slice(1)).toEqual(["clear", "clear", ["topic-1"]])
})

// report every outcome and keep rejected saves from masquerading as accepted edits
test("save notices retain order and rejection styling", () => {
	const notices: string[] = []
	showTopicToolCalls({
		topicToolToasts: { topicSaves: ["Saved tags.", "Added source."], topicSaveRejections: ["Not allowed."] },
		onSaved: (message) => {
			notices.push(`saved:${message}`)
		},
		onRejected: (message) => {
			notices.push(`rejected:${message}`)
		},
	})
	expect(notices).toEqual(["saved:Saved tags.", "saved:Added source.", "rejected:Not allowed."])
	expect(
		toProposedTopicEdit([
			{ toolCalls: [{ toolName: "proposeTopicEdit", input: { frequency: "invalid" }, output: "" }] },
		]),
	).toBeNull()
})

// keep the common rejection wording independent of browser pricing actions
test("shared rejection copy contains no pricing action", () => {
	expect(CHAT_REJECTION_COPY.budget).toBe("Carl is staring at an empty mug.")
	expect(CHAT_REJECTION_COPY.rateLimited).toBe("Carl needs a minute to catch up. Ask again shortly.")
	expect(toChatTopicLimitCopy(3)).toBe("Your plan has 3 topics, and you used them all.")
	expect(Object.values(CHAT_REJECTION_COPY).join(" ")).not.toContain("Pick up more coffee")
})
