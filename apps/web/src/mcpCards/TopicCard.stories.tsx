// the mcp topic card: the chat's topic card for an edit_topic or create_topic result, a preview with its Save button
// and a saved topic. Save calls edit_topic through the host, which a story has none of
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { TopicCard } from "./TopicCard"

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
	title: "MCP cards/TopicCard",
	component: TopicCard,
	args: {
		mcpTopicCardResult: {
			status: "confirmRequired",
			topicId: "topic-home-espresso",
			afterTopicDraft: { ...TOPIC_DRAFT, visibility: "public" },
			topicEditChanges: ["makes the topic public, so anyone can read it"],
			confirmation: "1793000000000.signature",
		},
		editTopicArguments: { topic_id: "topic-home-espresso", visibility: "public" },
	},
	argTypes: { mcpTopicCardResult: { control: "object" }, editTopicArguments: { control: "object" } },
	parameters: { session: "user" },
} satisfies Meta<typeof TopicCard>

export default meta
type Story = StoryObj<typeof meta>

// an edit that makes the topic public, previewed over the topic with its Save button
export const Preview: Story = {}

// a saved edit, which shows the topic as it now stands with no Save button
export const Saved: Story = {
	args: { mcpTopicCardResult: { status: "saved", topicId: "topic-home-espresso", afterTopicDraft: TOPIC_DRAFT } },
}
