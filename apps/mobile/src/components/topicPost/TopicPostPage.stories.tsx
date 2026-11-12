// the mobile Topic Post page, with the web stories' names. the page grows with the system text size, which the
// device's own setting sets to its largest
import { TopicPostPage } from "@carlnotes/core/components/TopicPostPage"
import { TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { TOPIC_POST_PAGE_ELEMENTS } from "./TopicPostScreen"

const meta = {
	title: "TopicPost/TopicPostPage",
	component: TopicPostPage,
	parameters: { webReference: "apps/web/src/components/topicPost/TopicPostPage.stories.tsx at 375px" },
	args: {
		topicPost: TOPIC_POST_DISCUSSION_STORY,
		isSignedIn: false,
		isEditing: false,
		onPublished: () => {},
		onEditDone: () => {},
		onChanged: () => {},
		elements: TOPIC_POST_PAGE_ELEMENTS,
	},
	render: (args) => (
		<ScrollView contentContainerClassName="px-4 pb-8">
			<TopicPostPage {...args} />
		</ScrollView>
	),
} satisfies Meta<typeof TopicPostPage>

export default meta
type Story = StoryObj<typeof meta>

// a reader's page: the title with its info popup, the byline then the reactions, the details line under them, the
// discussion, and the body
export const Default: Story = {}

// the count the comment thread reports replaces the one the Topic Post came with, and an edited Topic Post
// says so last
export const EditedWithOneComment: Story = {
	args: {
		topicPost: { ...TOPIC_POST_DISCUSSION_STORY, editedAt: "2026-11-03T16:05:00.000Z" },
		commentCount: 1,
	},
}

// a Topic Post whose summary is not written yet, with no discussion yet
export const NoSummary: Story = {
	args: { topicPost: { ...TOPIC_POST_DISCUSSION_STORY, summary: null, discussion: null } },
}

// a Topic Post whose image is still to be drawn pulses its empty header frame
export const PendingImage: Story = { args: { topicPost: { ...TOPIC_POST_DISCUSSION_STORY, image: null } } }
