// the page header's image: the image alone for a visitor, and the button with the camera overlay for an editor
import { EDIT_IMAGE_DIALOG_TITLES } from "@carlnotes/core/lib/topicImageEditor"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn } from "storybook/test"
import { TopicHeaderImage } from "./TopicImageButton"

// the podcast cover placeholder shows in place of a topic's image, which the app serves from its public files
const SAMPLE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }

const meta = {
	title: "Topic/TopicHeaderImage",
	component: TopicHeaderImage,
	args: {
		image: { page: SAMPLE_FILES, list: SAMPLE_FILES, thumbnail: SAMPLE_FILES },
		name: "Home espresso",
		editLabel: EDIT_IMAGE_DIALOG_TITLES.topic,
	},
} satisfies Meta<typeof TopicHeaderImage>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's image is not a button
export const Visitor: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button")).toBeNull()
	},
}

// an editor's image is a button that opens the image dialog
export const Editor: Story = {
	args: { onEdit: fn() },
	play: async ({ canvas, args }) => {
		await canvas.getByRole("button", { name: "Edit topic image" }).click()
		await expect(args.onEdit).toHaveBeenCalled()
	},
}
