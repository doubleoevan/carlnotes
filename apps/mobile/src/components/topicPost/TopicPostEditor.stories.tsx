// the mobile Topic Post editor, with the web stories' names. each story saves into a fake, so typing never reaches an
// account
import type { TopicPostEditorProps } from "@carlnotes/core/components/TopicPostEditor"
import { TOPIC_POST_READY_DRAFT_STORY, TOPIC_POST_SHORT_DRAFT_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicPostEditor } from "./TopicPostEditor"

// a save the story keeps, at the next version
const saveStoryTopicPostDraft: NonNullable<TopicPostEditorProps["saveTopicPostDraft"]> = async (
	_topicPostId,
	topicPostSavePayload,
) => ({
	status: "saved",
	version: topicPostSavePayload.version + 1,
})

const meta = {
	title: "TopicPost/TopicPostEditor",
	component: TopicPostEditor,
	parameters: { webReference: "apps/web/src/components/topicPost/TopicPostEditor.stories.tsx at 375px" },
	args: {
		topicPost: TOPIC_POST_SHORT_DRAFT_STORY,
		onPublished: () => {},
		onDone: () => {},
		saveTopicPostDraft: saveStoryTopicPostDraft,
	},
	render: (args) => (
		<View style={{ height: 600 }}>
			<TopicPostEditor {...args} />
		</View>
	),
} satisfies Meta<typeof TopicPostEditor>

export default meta
type Story = StoryObj<typeof meta>

// a draft short of the fewest words counts against them, and its Publish button stays disabled
export const ShortDraft: Story = {}

// a draft with a title and enough words shows its count alone and offers Publish
export const ReadyDraft: Story = { args: { topicPost: TOPIC_POST_READY_DRAFT_STORY } }
