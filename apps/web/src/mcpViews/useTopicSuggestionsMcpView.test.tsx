// host calls are mocked, while React owns real state updates and action serialization
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"
import * as host from "./mcpViewHost"
import { TOPIC_SUGGESTIONS_INPUT as input, TOPIC_SUGGESTIONS_FIXTURE as suggestions } from "./topicSuggestionsFixtures"
import { useTopicSuggestionsMcpView } from "./useTopicSuggestionsMcpView"

afterEach(() => mock.restore())

// a valid receipt reflects the destinations the host accepted together
const receipt = {
	status: "accepted" as const,
	title: input.title,
	topic: { id: "evals", name: "LLM evals", url: "https://carlnotes.com/topics/evals" },
	entryId: "entry-evals",
	queuedLinkCount: 3,
	receipts: [
		{
			topic: { id: "evals", name: "LLM evals", url: "https://carlnotes.com/topics/evals" },
			entryId: "entry-evals",
			queuedLinkCount: 3,
		},
		{
			topic: { id: "infra", name: "Agent infrastructure", url: "https://carlnotes.com/topics/infra" },
			entryId: "entry-infra",
			queuedLinkCount: 3,
		},
	],
}

test("best matches start checked without calling tools, and one send includes every checked Topic", async () => {
	const call = spyOn(host, "callMcpViewTool").mockResolvedValue({ content: [], structuredContent: receipt })
	const hook = await renderTestHook(() => useTopicSuggestionsMcpView({ suggestions, input }))
	try {
		expect([...hook.read().selectedTopics.keys()]).toEqual(["evals"])
		expect(call).not.toHaveBeenCalled()
		await act(async () => hook.read().select({ id: "infra", name: "Agent infrastructure" }))
		await act(async () => Promise.all([hook.read().send(), hook.read().send()]))
		expect(call).toHaveBeenCalledTimes(1)
		expect(call.mock.calls[0]).toEqual([
			"send_to_topic",
			{ ...input, topic_ids: ["evals", "infra"], request_id: expect.any(String) },
		])
		expect(hook.read().receipt).toEqual(receipt)
	} finally {
		await hook.close()
	}
})

test("search and tool-cursor pages preserve explicit selections without rechecking an unchecked recommendation", async () => {
	const secondPage = {
		...suggestions,
		editableTopics: [suggestions.editableTopics[1]],
		nextCursor: null,
		newPrivateTopic: undefined,
	}
	const call = spyOn(host, "callMcpViewTool").mockResolvedValue({ content: [], structuredContent: secondPage })
	const hook = await renderTestHook(() => useTopicSuggestionsMcpView({ suggestions, input }))
	try {
		await act(async () => hook.read().select({ id: "evals", name: "LLM evals" }))
		await act(async () => hook.read().openPage(2))
		expect(call.mock.calls[0]).toEqual(["suggest_topics", { ...input, query: "", cursor: suggestions.nextCursor }])
		expect(hook.read().pageIndex).toBe(1)
		await act(async () => hook.read().select({ id: "infra", name: "Agent infrastructure" }))
		call.mockResolvedValue({ content: [], structuredContent: suggestions })
		await act(async () => hook.read().search("eval"))
		expect(hook.read().pageIndex).toBe(0)
		expect([...hook.read().selectedTopics.keys()]).toEqual(["infra"])
		expect(call.mock.lastCall).toEqual(["suggest_topics", { ...input, query: "eval", cursor: undefined }])
		await act(async () => hook.read().openPage(2))
		await act(async () => hook.read().openPage(1))
		expect(call.mock.lastCall).toEqual(["suggest_topics", { ...input, query: "eval", cursor: undefined }])
	} finally {
		await hook.close()
	}
})

test("numbered jumps follow returned cursors and preserve the selection without sending", async () => {
	const call = spyOn(host, "callMcpViewTool")
	for (const nextCursor of ["third-page-cursor", "fourth-page-cursor", null]) {
		call.mockResolvedValueOnce({
			content: [],
			structuredContent: { ...suggestions, nextCursor, newPrivateTopic: undefined, pageCount: 4 },
		})
	}
	const hook = await renderTestHook(() =>
		useTopicSuggestionsMcpView({ suggestions: { ...suggestions, pageCount: 4 }, input }),
	)
	try {
		await act(async () => hook.read().openPage(4))
		expect(call.mock.calls.map(([name, args]) => [name, args.cursor])).toEqual([
			["suggest_topics", suggestions.nextCursor],
			["suggest_topics", "third-page-cursor"],
			["suggest_topics", "fourth-page-cursor"],
		])
		expect(hook.read().pageIndex).toBe(3)
		expect([...hook.read().selectedTopics.keys()]).toEqual(["evals"])
		call.mockResolvedValue({ content: [], structuredContent: suggestions })
		await act(async () => hook.read().openPage(1))
		expect(call.mock.lastCall).toEqual(["suggest_topics", { ...input, query: "", cursor: undefined }])
		expect(hook.read().pageIndex).toBe(0)
	} finally {
		await hook.close()
	}
})

test("a failed numbered jump retains the current page and unknown totals expose only reachable pages", async () => {
	const { pageCount: _pageCount, ...withoutTotal } = suggestions
	const secondPage = { ...withoutTotal, nextCursor: null, newPrivateTopic: undefined }
	const call = spyOn(host, "callMcpViewTool").mockRejectedValueOnce(new Error("temporary failure"))
	const hook = await renderTestHook(() => useTopicSuggestionsMcpView({ suggestions: withoutTotal, input }))
	try {
		expect(hook.read().pageCount).toBe(2)
		await act(async () => hook.read().openPage(2))
		expect(hook.read().pageIndex).toBe(0)
		expect([...hook.read().selectedTopics.keys()]).toEqual(["evals"])
		call.mockResolvedValue({ content: [], structuredContent: secondPage })
		await act(async () => hook.read().openPage(2))
		expect(hook.read().pageIndex).toBe(1)
		expect(hook.read().pageCount).toBe(2)
		await act(async () => hook.read().openPage(3))
		expect(call).toHaveBeenCalledTimes(2)
	} finally {
		await hook.close()
	}
})

test("a jump to page 20 ranks the editable catalog only once", async () => {
	const first = { ...suggestions, pageCount: 20, pageCursors: { "20": "last-page-cursor" } }
	const call = spyOn(host, "callMcpViewTool").mockResolvedValue({
		content: [],
		structuredContent: { ...first, nextCursor: null },
	})
	const hook = await renderTestHook(() => useTopicSuggestionsMcpView({ suggestions: first, input }))
	try {
		await act(async () => hook.read().openPage(20))
		expect(call).toHaveBeenCalledTimes(1)
		expect(call.mock.calls[0]?.[1]).toMatchObject({ cursor: "last-page-cursor" })
		expect(hook.read().pageIndex).toBe(19)
	} finally {
		await hook.close()
	}
})

test("lost send responses reuse the same request id and never log private content", async () => {
	const call = spyOn(host, "callMcpViewTool")
		.mockRejectedValueOnce(new Error(input.summary))
		.mockResolvedValue({ content: [], structuredContent: receipt })
	const hook = await renderTestHook(() => useTopicSuggestionsMcpView({ suggestions, input }))
	try {
		await act(async () => hook.read().send())
		expect(hook.read().error).not.toContain(input.summary)
		expect(hook.read().receipt).toBeNull()
		await act(async () => hook.read().send())
		expect(call.mock.calls[0]).toEqual(call.mock.calls[1])
		expect(hook.read().receipt?.status).toBe("accepted")
	} finally {
		await hook.close()
	}
})

test("the new-topic choice uses source suggestions and an unconfirmed Draft, then sends the original chat only to the confirmed new Topic", async () => {
	const draft = {
		...EMPTY_TOPIC_DRAFT,
		name: input.title,
		prompt: input.summary,
		sources: [{ sourceOption: "rss" as const, value: "https://example.com/feed.xml" }],
	}
	const preview = {
		status: "createConfirmRequired" as const,
		topicId: null,
		afterTopicDraft: draft,
		confirmation: "fixture-confirmation",
	}
	const call = spyOn(host, "callMcpViewTool")
		.mockResolvedValueOnce({ content: [], structuredContent: { status: "ok", sources: draft.sources } })
		.mockResolvedValueOnce({ content: [], structuredContent: preview })
	const hook = await renderTestHook(() => useTopicSuggestionsMcpView({ suggestions, input }))
	try {
		expect(call).not.toHaveBeenCalled()
		await act(async () => hook.read().startTopic())
		expect(call.mock.calls.map(([name]) => name)).toEqual(["suggest_sources", "create_topic"])
		expect(call.mock.calls[1]?.[1]).not.toHaveProperty("confirmation")
		expect(hook.read().draft).toEqual(preview)
		call.mockResolvedValueOnce({ content: [], structuredContent: receipt })
		await act(async () => hook.read().topicCreated({ id: "created", name: input.title }))
		expect(hook.read().selectedTopics.has("created")).toBe(true)
		expect(hook.read().draft).toBeNull()
		expect(call).toHaveBeenCalledTimes(3)
		expect(call.mock.calls[2]?.[0]).toBe("send_to_topic")
		expect(call.mock.calls[2]?.[1]).toMatchObject({
			topic_ids: ["created"],
			summary: input.summary,
			links: input.links,
		})
		expect([...hook.read().selectedTopics.keys()]).toEqual(["created"])
	} finally {
		await hook.close()
	}
})

test("a bound connection rejects another destination and new-Topic work before host calls", async () => {
	const call = spyOn(host, "callMcpViewTool")
	const hook = await renderTestHook(() =>
		useTopicSuggestionsMcpView({ suggestions: { ...suggestions, routeTopicId: "evals" }, input }),
	)
	try {
		await act(async () => hook.read().select({ id: "infra", name: "Infrastructure" }))
		await act(async () => hook.read().startTopic())
		expect([...hook.read().selectedTopics.keys()]).toEqual(["evals"])
		expect(call).not.toHaveBeenCalled()
	} finally {
		await hook.close()
	}
})

test("paging and a failed send preserve the same private backlink through retry", async () => {
	const chat_url = "https://chatgpt.com/c/private-backlink-canary"
	const referencedInput = { ...input, chat_url }
	const call = spyOn(host, "callMcpViewTool").mockResolvedValueOnce({
		content: [],
		structuredContent: { ...suggestions, nextCursor: null },
	})
	const hook = await renderTestHook(() => useTopicSuggestionsMcpView({ suggestions, input: referencedInput }))
	try {
		await act(async () => hook.read().openPage(2))
		expect(call.mock.calls[0]?.[1]).toHaveProperty("chat_url", chat_url)
		call.mockRejectedValueOnce(new Error("response lost"))
		await act(async () => hook.read().send())
		const firstSend = call.mock.calls[1]?.[1]
		call.mockResolvedValueOnce({ content: [], structuredContent: receipt })
		await act(async () => hook.read().send())
		expect(firstSend).toHaveProperty("chat_url", chat_url)
		expect(call.mock.calls[2]?.[1]).toEqual(firstSend)
		expect(hook.read().receipt).toEqual(receipt)
	} finally {
		await hook.close()
	}
})

// draft defaults follow the account metadata while explicit edits remain controlled by the form
test.each([true, false])(
	"new-Topic podcast default follows the account's current allowance: %s",
	async (isPodcastEnabledByDefault) => {
		host.setMcpViewData({
			"carlnotes/card": {
				session: null,
				podcastEpisodes: [],
				topicDraftOptions: { knownTags: ["existing"], isPodcastEnabledByDefault },
			},
		})
		const call = spyOn(host, "callMcpViewTool")
			.mockResolvedValueOnce({ content: [], structuredContent: { status: "ok", sources: [] } })
			.mockResolvedValueOnce({
				content: [],
				structuredContent: {
					status: "createConfirmRequired",
					topicId: null,
					afterTopicDraft: EMPTY_TOPIC_DRAFT,
					confirmation: "fixture",
				},
			})
		const hook = await renderTestHook(() => useTopicSuggestionsMcpView({ suggestions, input }))
		try {
			await act(async () => hook.read().startTopic())
			expect(call.mock.calls[1]?.[1]).toHaveProperty("isPodcastEnabled", isPodcastEnabledByDefault)
		} finally {
			await hook.close()
			host.setMcpViewData(undefined)
		}
	},
)

// a lost send response retains the created Topic and the exact retry key
test("a failed post-creation send retries without another Topic creation or charge", async () => {
	const call = spyOn(host, "callMcpViewTool").mockRejectedValueOnce(new Error("response lost"))
	const hook = await renderTestHook(() =>
		useTopicSuggestionsMcpView({
			suggestions,
			input: { ...input, chat_url: "codex://threads/01a19dd3-a216-7831-ae82-d65100539bef" },
		}),
	)
	try {
		await act(async () => hook.read().topicCreated({ id: "created", name: "New Topic" }))
		expect([...hook.read().selectedTopics.keys()]).toEqual(["created"])
		expect(hook.read().error).not.toBeNull()
		const firstAttempt = call.mock.calls[0]
		call.mockResolvedValueOnce({ content: [], structuredContent: receipt })
		await act(async () => hook.read().send())
		expect(call.mock.calls[1]).toEqual(firstAttempt)
		expect(call.mock.calls.every(([name]) => name === "send_to_topic")).toBe(true)
		expect(hook.read().receipt?.status).toBe("accepted")
	} finally {
		await hook.close()
	}
})
