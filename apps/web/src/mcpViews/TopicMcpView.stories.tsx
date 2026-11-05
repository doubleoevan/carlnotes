// the Topic MCP view: the chat's topic MCP view for an edit_topic or create_topic result, a preview with its Save button
// and a saved topic. Save calls edit_topic through the host, which a story has none of
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { useEffect } from "react"
import { setMcpViewData } from "./mcpViewHost"
import { TopicMcpView } from "./TopicMcpView"

// a topic's fields as edit_topic returns them
const TOPIC_DRAFT = {
	...EMPTY_TOPIC_DRAFT,
	name: "Home espresso",
	prompt: "Grinders, burrs, and the shots worth pulling at home.",
	sources: [{ sourceOption: "reddit" as const, value: "r/espresso" }],
	tags: ["coffee"],
	isPodcastEnabled: true,
}

const meta = {
	title: "MCP Apps/MCP views/TopicMcpView",
	component: TopicMcpView,
	args: {
		mcpViewTopicResult: {
			status: "confirmRequired",
			topicId: "topic-home-espresso",
			afterTopicDraft: { ...TOPIC_DRAFT, visibility: "public" },
			topicEditChanges: ["makes the topic public, so anyone can read it"],
			confirmation: "1793000000000.signature",
		},
		editTopicArguments: { topic_id: "topic-home-espresso", visibility: "public" },
	},
	argTypes: { mcpViewTopicResult: { control: "object" }, editTopicArguments: { control: "object" } },
	parameters: { session: "user" },
	decorators: [
		(Story, context) => {
			const result = context.args.mcpViewTopicResult
			const receiptLinks = context.parameters.receiptLinks
			useEffect(() => {
				setMcpViewData(
					result.status === "accepted"
						? {
								[MCP_VIEW_META_KEY]: {
									session: null,
									podcastEpisodes: [],
									sendReceiptLinks: (result.receipts ?? [result]).map((receipt) => ({
										entryId: receipt.entryId,
										links: receiptLinks ?? [
											{ url: "https://example.com/burrs", title: "Comparing conical and flat burrs" },
											{ url: "https://example.com/grinder-testing" },
										],
									})),
								},
							}
						: undefined,
				)
				return () => setMcpViewData(undefined)
			}, [result, receiptLinks])
			return <Story />
		},
	],
} satisfies Meta<typeof TopicMcpView>

export default meta
type Story = StoryObj<typeof meta>

// an edit that makes the topic public, previewed over the topic with its Save button
export const Preview: Story = {}

// a saved edit, which shows the topic as it now stands with no Save button
export const Saved: Story = {
	args: { mcpViewTopicResult: { status: "saved", topicId: "topic-home-espresso", afterTopicDraft: TOPIC_DRAFT } },
}

// explicit sends show bounded receipts and choices, with no save or automatic retry action
export const PersonalSourcesAccepted: Story = {
	args: {
		mcpViewTopicResult: {
			status: "accepted",
			topic: { id: "coffee", name: "Home espresso", url: "https://carlnotes.com/topics/coffee" },
			entryId: "entry",
			title: "A useful comparison of conical and flat burrs",
			queuedLinkCount: 3,
		},
		editTopicArguments: null,
	},
}
export const CreatePreview: Story = {
	args: {
		mcpViewTopicResult: {
			status: "createConfirmRequired",
			topicId: null,
			afterTopicDraft: { ...TOPIC_DRAFT, visibility: "private", team: null, inviteEmails: [], isPodcastEnabled: false },
			confirmation: "confirmation",
		},
		editTopicArguments: null,
	},
}
export const PersonalSourcesQuota: Story = {
	args: { mcpViewTopicResult: { status: "quota", resetAt: "2026-11-03T00:00:00.000Z" }, editTopicArguments: null },
}
export const PersonalSourcesDisconnected: Story = {
	args: { mcpViewTopicResult: { status: "disconnected" }, editTopicArguments: null },
}
export const PersonalSourcesUnavailable: Story = {
	args: { mcpViewTopicResult: { status: "unavailable", reason: "disabled" }, editTopicArguments: null },
}
export const PersonalSourcesRemoved: Story = {
	args: { mcpViewTopicResult: { status: "conflict", reason: "removed" }, editTopicArguments: null },
}
export const PersonalSourcesLongTitle: Story = {
	args: {
		mcpViewTopicResult: {
			status: "accepted",
			topic: {
				id: "coffee",
				name: "AverylongunbrokenTopicnamethatmustwraponasmallhostframe".repeat(3),
				url: "https://carlnotes.com/topics/coffee",
			},
			entryId: "entry",
			title: "☕".repeat(200),
			queuedLinkCount: 0,
		},
		editTopicArguments: null,
	},
}

// multiple destinations retain their own numbered candidate list
export const PersonalSourcesMultipleTopics: Story = {
	parameters: {
		receiptLinks: [
			{ url: "https://en.wikipedia.org/wiki/Terrarium", title: "Terrarium - Wikipedia" },
			{ url: "https://example.com/humidity-sensors" },
		],
	},
	args: {
		mcpViewTopicResult: {
			status: "accepted",
			title: "Humidity sensors for a moss terrarium",
			topic: { id: "humidity", name: "Moss terrarium humidity", url: "https://carlnotes.com/topics/humidity" },
			entryId: "humidity-entry",
			queuedLinkCount: 2,
			receipts: [
				{
					topic: { id: "humidity", name: "Moss terrarium humidity", url: "https://carlnotes.com/topics/humidity" },
					entryId: "humidity-entry",
					queuedLinkCount: 2,
				},
				{
					topic: {
						id: "ventilation",
						name: "Moss terrarium ventilation",
						url: "https://carlnotes.com/topics/ventilation",
					},
					entryId: "ventilation-entry",
					queuedLinkCount: 2,
				},
			],
		},
		editTopicArguments: null,
	},
}

export const CreateWithChatLinks: Story = {
	args: {
		mcpViewTopicResult: {
			status: "createConfirmRequired",
			topicId: null,
			afterTopicDraft: {
				...TOPIC_DRAFT,
				visibility: "private",
				team: null,
				inviteEmails: [],
				isPodcastEnabled: false,
				sources: [
					{ sourceOption: "url", value: "https://en.wikipedia.org/wiki/Terrarium" },
					{ sourceOption: "rss", value: "https://example.com/feed" },
				],
			},
			confirmation: "confirmation",
		},
		editTopicArguments: null,
	},
}
