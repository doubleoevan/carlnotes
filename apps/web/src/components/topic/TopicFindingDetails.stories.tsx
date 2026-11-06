// a topic finding's details: Carl's notes, the sender's private annotation, and the stats
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LinkOpenerContext } from "@/components/common/AnchorLink"
import { LLM_TOOLING_TOPIC_FIXTURE } from "../../../.storybook/fixtures"
import { toStoryTopicFinding } from "../../../.storybook/fixtures/topicFeed"
import { TopicFindingDetails } from "./TopicFindingDetails"

// the finding every story shows
const STORY_TOPIC_FINDING = toStoryTopicFinding({
	findingId: "finding-llm-tooling-compared",
	resourceId: "resource-llm-tooling-compared",
	url: "https://example.com/llm-tooling-compared",
	title: "Three LLM tooling stacks, one retrieval task",
	viewCount: 1284,
	relevanceExplanation: "It compares three stacks on one retrieval task and reports latency, cost, and accuracy.",
})

const meta = {
	title: "Topic/TopicFindingDetails",
	component: TopicFindingDetails,
	args: { resource: STORY_TOPIC_FINDING, topic: { ...LLM_TOOLING_TOPIC_FIXTURE, visibility: "public" } },
	// a link opener marks an embedded host, which shows no link preview, so the story calls no api
	decorators: [
		(Story) => (
			<LinkOpenerContext.Provider value={() => {}}>
				<Story />
			</LinkOpenerContext.Provider>
		),
	],
} satisfies Meta<typeof TopicFindingDetails>

export default meta
type Story = StoryObj<typeof meta>

// Carl's notes and the stats
export const Notes: Story = {}

// the sender's private annotation under Carl's notes
export const PrivateAnnotation: Story = {
	args: { personalAnnotation: "Compare this with the stack we picked in March." },
}

// a finding Carl has not written notes for
export const NoNotesYet: Story = {
	args: { resource: { ...STORY_TOPIC_FINDING, relevanceExplanation: "" } },
}
