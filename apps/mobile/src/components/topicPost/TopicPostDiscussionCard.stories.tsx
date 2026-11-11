// the mobile Topic Post discussion card, with the web stories' names
import { TOPIC_POST_DISCUSSION_EDITOR_STORY, TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicPostDiscussionCard } from "./TopicPostDiscussionCard"

const meta = {
	title: "TopicPost/TopicPostDiscussionCard",
	component: TopicPostDiscussionCard,
	parameters: { webReference: "apps/web/src/components/topicPost/TopicPostDiscussionCard.stories.tsx at 375px" },
	args: { topicPost: TOPIC_POST_DISCUSSION_STORY, onChanged: () => {}, sendRegeneration: async () => "discussion-2" },
} satisfies Meta<typeof TopicPostDiscussionCard>

export default meta
type Story = StoryObj<typeof meta>

// a reader plays the recording, and sees no Regenerate. the transcript is closed behind the caret before the name
export const Playing: Story = {}

// a press on the card's name opens the transcript, each turn after its speaker's name, and a second press closes it
export const TranscriptOpen: Story = {}

// whoever may publish on the Topic opens the note for the hosts, with the month's count
export const Regenerate: Story = { args: { topicPost: TOPIC_POST_DISCUSSION_EDITOR_STORY } }

// the first recording on its way has no play button yet, offers no second start, and has no transcript to open
export const Recording: Story = {
	args: {
		topicPost: {
			...TOPIC_POST_DISCUSSION_EDITOR_STORY,
			discussion: { id: null, durationSeconds: null, publishedAt: null, isRecording: true },
		},
	},
}

// a post with no discussion shows the card to whoever may record one
export const NoDiscussion: Story = { args: { topicPost: { ...TOPIC_POST_DISCUSSION_EDITOR_STORY, discussion: null } } }

// at the month's limit the recording still plays, and Regenerate is absent
export const Limit: Story = {
	args: { topicPost: { ...TOPIC_POST_DISCUSSION_EDITOR_STORY, discussionRegenerationQuota: { used: 10, limit: 10 } } },
}
