import { toTestTopicFeed } from "@carlnotes/contracts/topicFeedTestFixtures"
import { TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import { toTopicPostShare } from "@carlnotes/core/lib/topicPosts"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ShareTopic } from "./ShareTopic"

// the story post's topic, as its owner shares it, and the post that is shared in its place
const { topic: STORY_TOPIC, topicPost: STORY_TOPIC_POST } = toTopicPostShare(TOPIC_POST_DISCUSSION_STORY)

// the web's share options use a native sheet and the platform's send dialog
const meta = {
	title: "Share/ShareTopic",
	component: ShareTopic,
	parameters: { webReference: "apps/web/src/components/share/ShareTopic.tsx, native share sheet" },
	args: { topic: toTestTopicFeed() },
} satisfies Meta<typeof ShareTopic>
export default meta
type Story = StoryObj<typeof meta>
export const Public: Story = {}
export const Labeled: Story = { args: { isLabeled: true } }
export const Private: Story = { args: { topic: toTestTopicFeed({ visibility: "private" }) } }

// a public topic's post shared in the topic's place, under the labeled button the post's popup shows
export const TopicPost: Story = { args: { topic: STORY_TOPIC, topicPost: STORY_TOPIC_POST, isLabeled: true } }

// an invite topic's post, as the topic's owner: posting is disabled, and the invite link names the post
export const InviteTopicPost: Story = {
	args: { topic: { ...STORY_TOPIC, visibility: "invite" }, topicPost: STORY_TOPIC_POST, isLabeled: true },
}
