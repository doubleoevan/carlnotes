// the editor's image block: a generated image with regenerations left, an upload, the month's limit reached, and a
// film's own image, in the same layout at the film's 16:9 frame
import { sendTopicPodcastEpisodeVideoImageRegeneration } from "@carlnotes/client/podcastEpisodeClient"
import { fetchTopicImageRender, sendTopicImageRegeneration } from "@carlnotes/client/topicImageClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, userEvent } from "storybook/test"
import { SAMPLE_TOPIC_IMAGE } from "../../../.storybook/fixtures/topics"
import { type EditableImage, TopicImageEditor } from "./TopicImageEditor"

// a topic with a generated image and most of the month's regenerations left
const TOPIC: EditableImage = {
	kind: "topic",
	id: "topic-1",
	name: "Home espresso",
	image: SAMPLE_TOPIC_IMAGE,
	imageOrigin: "generated",
	imagePrompt: "a lighthouse in a storm, oil painting",
	imageRegenerationQuota: { used: 3, limit: 15 },
}

// a film's own image, which the block edits by the film's podcast episode
const TOPIC_PODCAST_EPISODE_VIDEO: EditableImage = { ...TOPIC, kind: "topicPodcastEpisodeVideo", id: "episode-1" }

const meta = {
	title: "Topic/TopicImageEditor",
	component: TopicImageEditor,
	args: { editableImage: TOPIC, onImageChanged: fn() },
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

// an upload uploads again from a press on the image, with no Upload or Remove button
export const Uploaded: Story = {
	args: { editableImage: { ...TOPIC, imageOrigin: "uploaded", imagePrompt: null } },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Upload an image" })).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Upload" })).toBeNull()
		await expect(canvas.queryByRole("button", { name: "Remove" })).toBeNull()
	},
}

// the month's limit reached: Regenerate is gone, and the count line says so
export const LimitReached: Story = {
	args: { editableImage: { ...TOPIC, imageRegenerationQuota: { used: 15, limit: 15 } } },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: "Regenerate" })).toBeNull()
		await expect(canvas.getByText("15 of 15 used this month")).toBeVisible()
	},
}

// a topic with no image yet shows the muted ground
export const NoImage: Story = {
	args: { editableImage: { ...TOPIC, image: null, imageOrigin: null, imagePrompt: null } },
}

// a film's own image in the standard layout: the image at 16:9, which a press uploads over, then the image prompt
// beside Regenerate
export const TopicPodcastEpisodeVideo: Story = {
	args: { editableImage: TOPIC_PODCAST_EPISODE_VIDEO },
	beforeEach: () => {
		mocked(sendTopicPodcastEpisodeVideoImageRegeneration).mockResolvedValue("render-1")
		mocked(fetchTopicImageRender).mockResolvedValue({ status: "pending", image: null })
	},
	play: async ({ canvas }) => {
		// the image is the upload control at the film's frame, with no Upload button beside Regenerate
		const uploadBox = canvas.getByRole("button", { name: "Upload an image" }).getBoundingClientRect()
		await expect(Math.abs(uploadBox.width / uploadBox.height - 16 / 9)).toBeLessThan(0.02)
		await expect(canvas.queryByRole("button", { name: "Upload" })).toBeNull()

		// the image prompt sits on Regenerate's line, under the image
		const imagePromptBox = canvas.getByLabelText("Image prompt").getBoundingClientRect()
		const regenerateButton = canvas.getByRole("button", { name: "Regenerate" })
		const regenerateBox = regenerateButton.getBoundingClientRect()
		await expect(imagePromptBox.top).toBeGreaterThanOrEqual(uploadBox.bottom)
		await expect(imagePromptBox.right).toBeLessThan(regenerateBox.left)
		await expect(imagePromptBox.bottom).toBeGreaterThan(regenerateBox.top)

		// Regenerate sends the film's image prompt, counts against the shared limit, and shows the render under way
		await regenerateButton.click()
		await expect(mocked(sendTopicPodcastEpisodeVideoImageRegeneration)).toHaveBeenCalledWith(
			"episode-1",
			"a lighthouse in a storm, oil painting",
		)
		await expect(await canvas.findByText("4 of 15 used this month")).toBeVisible()
		await expect(canvas.getByText("Dreaming, takes about a minute...")).toBeVisible()
	},
}

// a film at the month's limit keeps the image as the upload control, without the image prompt and Regenerate
export const TopicPodcastEpisodeVideoLimitReached: Story = {
	args: { editableImage: { ...TOPIC_PODCAST_EPISODE_VIDEO, imageRegenerationQuota: { used: 15, limit: 15 } } },
	play: async ({ canvas }) => {
		await expect(canvas.queryByLabelText("Image prompt")).toBeNull()
		await expect(canvas.queryByRole("button", { name: "Regenerate" })).toBeNull()
		await expect(canvas.getByRole("button", { name: "Upload an image" })).toBeVisible()
	},
}
