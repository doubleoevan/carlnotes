// the card of a Topic and a Podcast Episode: the comment thread, with the shared count at the card's top
// right for a user who may share
import { EMPTY_COMMENT_THREAD } from "@carlnotes/contracts/social"
import { toTestCommentThread, toTestEditorCommentThread } from "@carlnotes/contracts/socialTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { SocialSection } from "./SocialSection"

const meta = {
	title: "Social/SocialSection",
	component: SocialSection,
	args: {
		target: { kind: "topic", id: "topic-llm-tooling" },
		firstPage: toTestCommentThread(),
		isSignedIn: true,
		topicId: "topic-llm-tooling",
		isTopicOwner: false,
	},
	argTypes: { target: { control: false }, firstPage: { control: "object" } },
	parameters: { session: "user" },
} satisfies Meta<typeof SocialSection>

export default meta
type Story = StoryObj<typeof meta>

// comments in their card
export const WithComments: Story = {}

// nothing yet: the composer's button
export const Empty: Story = { args: { firstPage: EMPTY_COMMENT_THREAD } }

// a Topic's editor reads how many comments are shared with Carl at the card's top right, and presses each flame
export const TopicEditor: Story = {
	args: { isTopicOwner: true, firstPage: toTestEditorCommentThread({ usedCount: 1, slotCount: 3 }) },
}
