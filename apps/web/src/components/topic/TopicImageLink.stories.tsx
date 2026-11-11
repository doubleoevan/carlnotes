// a topic image as a link to its page: the pointer's link beside a title that opens the same page, the named link
// where the image is the only one, and the plain image on its own page
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { TopicImageLink } from "./TopicImageLink"

// the podcast cover placeholder shows in place of a topic's image, which the app serves from its public files
const SAMPLE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }

// the page the image opens
const TOPIC_PATH = "/topics/topic-home-espresso/home-espresso"

const meta = {
	title: "Topic/TopicImageLink",
	component: TopicImageLink,
	args: {
		image: { page: SAMPLE_FILES, list: SAMPLE_FILES, thumbnail: SAMPLE_FILES },
		size: "list",
		name: "Home espresso",
		path: TOPIC_PATH,
	},
} satisfies Meta<typeof TopicImageLink>

export default meta
type Story = StoryObj<typeof meta>

// beside a title that opens the same page, the link is out of the tab order and the accessibility tree
export const BesideTitle: Story = {
	play: async ({ canvas, canvasElement }) => {
		const link = canvasElement.querySelector("a")
		await expect(link).toHaveAttribute("href", TOPIC_PATH)
		await expect(link).toHaveAttribute("tabindex", "-1")
		await expect(canvas.queryByRole("link")).toBeNull()
	},
}

// a row's thumbnail, linked the same way
export const Thumbnail: Story = { args: { size: "thumbnail" } }

// the only link to the page has its name and its tab stop
export const OnlyLink: Story = {
	args: { size: "page", className: "w-80", label: "Open Home espresso" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("link", { name: "Open Home espresso" })).toHaveAttribute("href", TOPIC_PATH)
	},
}

// on the image's own page it is a plain image
export const OwnPage: Story = {
	parameters: { tanstack: { router: { route: { path: TOPIC_PATH } } } },
	play: async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector("a")).toBeNull()
		await expect(canvas.getByLabelText("Image of Home espresso")).toBeVisible()
	},
}
