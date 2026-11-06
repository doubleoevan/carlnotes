// stories exercise the real host-tool boundary with synthetic results and no external writes
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import type { App } from "@modelcontextprotocol/ext-apps"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useEffect } from "react"
import { expect } from "storybook/test"
import { LinkOpenerContext } from "@/components/common/AnchorLink"
import { openInNewTab } from "@/lib/externalLinks"
import { VISITOR_TOOL_RESULT } from "../../.storybook/fixtures/mcpViews"
import { McpViewToolText } from "./McpViewToolText"
import { setMcpViewApp } from "./mcpViewHost"
import { TopicSuggestionsMcpView } from "./TopicSuggestionsMcpView"
import { TOPIC_SUGGESTIONS_FIXTURE, TOPIC_SUGGESTIONS_INPUT } from "./topicSuggestionsFixtures"

// one controlled host implements the same cursor, send, and Topic Draft calls as production
const meta = {
	title: "MCP Apps/MCP views/TopicSuggestionsMcpView",
	component: TopicSuggestionsMcpView,
	args: { suggestions: TOPIC_SUGGESTIONS_FIXTURE, toolArguments: TOPIC_SUGGESTIONS_INPUT },
	parameters: { session: "user" },
	decorators: [
		(Story, context) => {
			useEffect(() => {
				setMcpViewApp({
					callServerTool: context.parameters.isPendingMcpRequest ? () => new Promise(() => {}) : replyToStoryTool,
					openLink: async () => ({}),
				} as unknown as App)
				return () => setMcpViewApp(null)
			}, [context.parameters.isPendingMcpRequest])
			return (
				<LinkOpenerContext.Provider value={openInNewTab}>
					<Story />
				</LinkOpenerContext.Provider>
			)
		},
	],
} satisfies Meta<typeof TopicSuggestionsMcpView>
export default meta
type Story = StoryObj<typeof meta>

// every action stays interactive without a connected MCP account
export const Matches: Story = {}

// a visitor's call returns only the tool's words
export const Visitor: Story = {
	parameters: { session: "visitor" },
	render: () => <McpViewToolText toolResult={VISITOR_TOOL_RESULT} />,
}
export const Default: Story = {}
export const Searched: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("checkbox", { name: /Agent infrastructure/ }))
		await userEvent.type(canvas.getByRole("combobox", { name: "Search your topics" }), "eval")
		await userEvent.keyboard("{Enter}")
	},
}
export const Autocomplete: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.type(canvas.getByRole("combobox", { name: "Search your topics" }), "Evaluating")
		await canvas.findByRole("option", { name: /Evaluating agent reliability/ })
	},
}
export const SelectionSynced: Story = {
	play: async ({ canvas, userEvent }) => {
		const checkbox = canvas.getByRole("checkbox", { name: "Agent infrastructure" })
		await userEvent.click(checkbox)
		await expect(canvas.getByRole("button", { name: "Remove Agent infrastructure" })).toBeVisible()
		await userEvent.click(checkbox)
		await expect(canvas.queryByRole("button", { name: "Remove Agent infrastructure" })).not.toBeInTheDocument()
		await userEvent.click(checkbox)
		await userEvent.click(canvas.getByRole("button", { name: "Remove Agent infrastructure" }))
		await expect(checkbox).not.toBeChecked()
	},
}
export const PageTwo: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^2$/ }))
	},
}
export const Sent: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("checkbox", { name: /Agent infrastructure/ }))
		await userEvent.click(canvas.getByRole("button", { name: /^Send this chat to 2 topics$/ }))
	},
}
export const Loading: Story = {
	parameters: { isPendingMcpRequest: true },
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^2$/ }))
	},
}
export const Empty: Story = {
	args: {
		suggestions: {
			...TOPIC_SUGGESTIONS_FIXTURE,
			editableTopics: [],
			publicTopicsToFollow: [],
			nextCursor: null,
			pageCount: 1,
		},
	},
}
export const Unavailable: Story = { args: { suggestions: { status: "unavailable" } } }
export const TopicBound: Story = { args: { suggestions: { ...TOPIC_SUGGESTIONS_FIXTURE, routeTopicId: "evals" } } }
export const WithoutToolArguments: Story = { args: { toolArguments: null } }
export const LongTitles: Story = {
	args: {
		suggestions: {
			...TOPIC_SUGGESTIONS_FIXTURE,
			editableTopics: TOPIC_SUGGESTIONS_FIXTURE.editableTopics.map((topic) => ({
				...topic,
				name: `${topic.name} ${"LongUnbrokenTopicName".repeat(6)}`,
			})),
		},
	},
}

// fake tool calls expose cursor paging and explicit confirmations without fetching or persisting
async function replyToStoryTool({
	name,
	arguments: input = {},
}: {
	name: string
	arguments?: Record<string, unknown>
}): Promise<Record<string, unknown>> {
	if (name === "suggest_topics") {
		return replyToStorySuggestions(input)
	}
	if (name === "send_to_topic") {
		const confirmations = (input.topic_ids as string[]).map((id) => ({
			topic: {
				id,
				name: TOPIC_SUGGESTIONS_FIXTURE.editableTopics.find((topic) => topic.id === id)?.name ?? "New Topic",
				url: `https://carlnotes.com/topics/${id}`,
			},
			entryId: `entry-${id}`,
			queuedLinkCount: TOPIC_SUGGESTIONS_INPUT.links.length,
		}))
		return {
			structuredContent: { status: "accepted", title: input.title, ...confirmations[0], confirmations },
			_meta: {
				[MCP_VIEW_META_KEY]: {
					session: null,
					podcastEpisodes: [],
					sendConfirmationLinks: confirmations.map((confirmation) => ({
						entryId: confirmation.entryId,
						links: TOPIC_SUGGESTIONS_INPUT.links.map((url, index) => ({
							url,
							title: index === 0 ? "Evaluating agent reliability" : undefined,
						})),
					})),
				},
			},
		}
	}
	if (name === "suggest_sources") {
		return {
			structuredContent: { status: "ok", sources: [{ sourceOption: "rss", value: "https://example.com/feed.xml" }] },
		}
	}
	if (name === "create_topic") {
		return {
			structuredContent: {
				status: input.confirmation ? "created" : "createConfirmRequired",
				topicId: input.confirmation ? "new-topic" : null,
				afterTopicDraft: { ...EMPTY_TOPIC_DRAFT, ...input },
				confirmation: "story-confirmation",
			},
		}
	}
	return { content: [{ type: "text", text: "Followed" }] }
}

// search and cursor fixtures keep their page labels consistent with the displayed subset
function replyToStorySuggestions(input: Record<string, unknown>): Record<string, unknown> {
	const secondPageTopic = {
		...TOPIC_SUGGESTIONS_FIXTURE.editableTopics[0],
		id: "page-two",
		name: "Evaluating agent reliability",
		isBestMatch: false,
	}
	const pageTopics = input.cursor ? [secondPageTopic] : TOPIC_SUGGESTIONS_FIXTURE.editableTopics
	const candidates = input.autocomplete ? [...TOPIC_SUGGESTIONS_FIXTURE.editableTopics, secondPageTopic] : pageTopics

	return {
		structuredContent: {
			...TOPIC_SUGGESTIONS_FIXTURE,
			editableTopics: candidates.filter((topic) =>
				topic.name.toLowerCase().includes(String(input.query ?? "").toLowerCase()),
			),
			nextCursor: input.cursor || input.query ? null : "fixture-page-2",
			pageCount: input.query ? 1 : 2,
			newPrivateTopic: TOPIC_SUGGESTIONS_FIXTURE.newPrivateTopic,
		},
	}
}
