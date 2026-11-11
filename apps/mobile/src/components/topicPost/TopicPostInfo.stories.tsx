// the mobile Topic Post info popup, with the web stories' names. each story passes its post, which a story has
// in place of an api read
import { TOPIC_POST_DISCUSSION_STORY, TOPIC_POST_SHORT_DRAFT_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicPostInfo } from "./TopicPostInfo"

const meta = {
	title: "TopicPost/TopicPostInfo",
	component: TopicPostInfo,
	parameters: { webReference: "apps/web/src/components/topicPost/TopicPostInfo.stories.tsx at 375px" },
	args: {
		topicPostId: TOPIC_POST_DISCUSSION_STORY.id,
		title: TOPIC_POST_DISCUSSION_STORY.title,
		topicPost: TOPIC_POST_DISCUSSION_STORY,
	},
} satisfies Meta<typeof TopicPostInfo>

export default meta
type Story = StoryObj<typeof meta>

// the note icon opens the post's author with Share, its Topic, its discussion, and Carl's notes
export const Default: Story = {}

// a draft has no reactions, no Share, no discussion, and no notes yet
export const Draft: Story = {
	args: {
		topicPostId: TOPIC_POST_SHORT_DRAFT_STORY.id,
		title: TOPIC_POST_SHORT_DRAFT_STORY.title,
		topicPost: TOPIC_POST_SHORT_DRAFT_STORY,
	},
}
