import type { EditableImage } from "@carlnotes/core/components/TopicImageEditor"
import type { Meta, StoryObj } from "@storybook/react-native"
import { TopicImageEditor } from "./TopicImageEditor"

// the podcast cover placeholder stands in for a topic's image, which the app serves from its public files
const SAMPLE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }

// a topic with a generated image and most of the month's regenerations left
const TOPIC: EditableImage = {
	kind: "topic",
	id: "topic-1",
	name: "Home espresso",
	image: { page: SAMPLE_FILES, list: SAMPLE_FILES, thumbnail: SAMPLE_FILES },
	imageOrigin: "generated",
	imagePrompt: "a lighthouse in a storm, oil painting",
	imageRegenerationQuota: { used: 3, limit: 15 },
}

// the editor's image block: a generated image with regenerations left, an upload, the month's limit reached, and a
// topic with no image yet
const meta = {
	title: "Topic/TopicImageEditor",
	component: TopicImageEditor,
	parameters: { webReference: "apps/web/src/components/topic/TopicImageEditor.tsx" },
	args: { editableImage: TOPIC },
} satisfies Meta<typeof TopicImageEditor>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Uploaded: Story = { args: { editableImage: { ...TOPIC, imageOrigin: "uploaded", imagePrompt: null } } }
export const LimitReached: Story = {
	args: { editableImage: { ...TOPIC, imageRegenerationQuota: { used: 15, limit: 15 } } },
}
export const NoImage: Story = {
	args: { editableImage: { ...TOPIC, image: null, imageOrigin: null, imagePrompt: null } },
}
