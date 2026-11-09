// the editor's image block: a generated image with regenerations left, an upload with Remove, and the month's limit
// reached
import { fetchTopicImageRender, sendTopicImageRegeneration } from "@carlnotes/client/topicImageClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, userEvent } from "storybook/test"
import { TopicImageEditor, type TopicImageEditorSubject } from "./TopicImageEditor"

// the podcast cover placeholder stands in for a topic's image, which the app serves from its public files
const SAMPLE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }

// a topic with a generated image and most of the month's regenerations left
const TOPIC: TopicImageEditorSubject = {
	kind: "topic",
	id: "topic-1",
	name: "Home espresso",
	image: { page: SAMPLE_FILES, list: SAMPLE_FILES, thumbnail: SAMPLE_FILES },
	imageOrigin: "generated",
	imagePrompt: "a lighthouse in a storm, oil painting",
	imageRegenerationQuota: { used: 3, limit: 15 },
}

const meta = {
	title: "Topic/TopicImageEditor",
	component: TopicImageEditor,
	args: { subject: TOPIC, onImageChanged: fn() },
	decorators: [(Story) => <div className="w-full max-w-xl">{Story()}</div>],
} satisfies Meta<typeof TopicImageEditor>

export default meta
type Story = StoryObj<typeof meta>

// Regenerate sends the image prompt, counts the regeneration, and shows the render under way
export const Default: Story = {
	beforeEach: () => {
		mocked(sendTopicImageRegeneration).mockResolvedValue("render-1")
		mocked(fetchTopicImageRender).mockResolvedValue({ status: "pending", image: null })
	},
	play: async ({ canvas, args }) => {
		// the field opens with the prompt that drew the current image, and a new one replaces it
		const imagePromptInput = canvas.getByLabelText("Image prompt")
		await expect(imagePromptInput).toHaveValue("a lighthouse in a storm, oil painting")
		await userEvent.clear(imagePromptInput)
		await userEvent.type(imagePromptInput, "a rainy harbor at dusk")
		await canvas.getByRole("button", { name: "Regenerate" }).click()
		await expect(mocked(sendTopicImageRegeneration)).toHaveBeenCalledWith("topic-1", "a rainy harbor at dusk")
		await expect(await canvas.findByText("4 of 15 used this month")).toBeVisible()

		// the new image is not in place while the render is pending
		await expect(args.onImageChanged).not.toHaveBeenCalled()
	},
}

// an upload offers Remove, a press on the image uploads, and no Upload button repeats it
export const Uploaded: Story = {
	args: { subject: { ...TOPIC, imageOrigin: "uploaded", imagePrompt: null } },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Remove" })).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Upload an image" })).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Upload" })).toBeNull()
	},
}

// the month's limit reached: Regenerate is gone, and the count line says so
export const LimitReached: Story = {
	args: { subject: { ...TOPIC, imageRegenerationQuota: { used: 15, limit: 15 } } },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: "Regenerate" })).toBeNull()
		await expect(canvas.getByText("15 of 15 used this month")).toBeVisible()
	},
}

// a topic with no image yet shows the muted ground
export const NoImage: Story = {
	args: { subject: { ...TOPIC, image: null, imageOrigin: null, imagePrompt: null } },
}
