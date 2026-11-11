// the details line under a page's byline: a topic page's counts, the line wrapped at phone width, counts with some
// at zero, a line with every count at zero, a Topic Post's details, and a line that ends with a link
import { toCountDetails } from "@carlnotes/core/lib/detailsLine"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { DetailsLine } from "./DetailsLine"

// the counts of a topic page with every section filled, in the line's order
const TOPIC_COUNT_DETAILS = toCountDetails([
	{ count: 1, noun: "film" },
	{ count: 17, noun: "podcast episode" },
	{ count: 30, noun: "finding" },
	{ count: 4, noun: "hot take" },
	{ count: 2, noun: "post" },
	{ count: 5, noun: "note" },
	{ count: 6, noun: "similar topic" },
])

const meta = {
	title: "Common/DetailsLine",
	component: DetailsLine,
	args: { details: TOPIC_COUNT_DETAILS },
} satisfies Meta<typeof DetailsLine>

export default meta
type Story = StoryObj<typeof meta>

// a topic page's counts on one line, each but the last followed by its middle dot
export const Default: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("1 film ·")).toBeVisible()
		await expect(canvas.getByText("17 podcast episodes ·")).toBeVisible()
		await expect(canvas.getByText("6 similar topics")).toBeVisible()
	},
}

// beside a phone's header image the line wraps between counts, and no count breaks inside itself
export const WrappedAtPhoneWidth: Story = {
	decorators: [(Story) => <div className="w-[13.5rem]">{Story()}</div>],
	play: async ({ canvas }) => {
		// every count is one line tall, and the last count sits on a row below the first
		const podcastEpisodeCount = canvas.getByText("17 podcast episodes ·")
		const similarTopicCount = canvas.getByText("6 similar topics")
		await expect(podcastEpisodeCount.getClientRects()).toHaveLength(1)
		await expect(similarTopicCount.getClientRects()).toHaveLength(1)
		await expect(similarTopicCount.getBoundingClientRect().top).toBeGreaterThan(
			canvas.getByText("1 film ·").getBoundingClientRect().bottom,
		)
	},
}

// a count of zero is left out, and the counts around it keep their order
export const SomeZero: Story = {
	args: {
		details: toCountDetails([
			{ count: 0, noun: "film" },
			{ count: 3, noun: "podcast episode" },
			{ count: 12, noun: "finding" },
			{ count: 0, noun: "hot take" },
			{ count: 1, noun: "post" },
			{ count: 0, noun: "note" },
			{ count: 0, noun: "similar topic" },
		]),
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("3 podcast episodes ·")).toBeVisible()
		await expect(canvas.getByText("1 post")).toBeVisible()
		await expect(canvas.queryByText(/film|hot take|note|similar topic/)).toBeNull()
	},
}

// a line with every count at zero is absent
export const AllZero: Story = {
	args: { details: toCountDetails([{ count: 0, noun: "film" }]) },
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("p")).toBeNull()
	},
}

// a Topic Post's date, reading time, comment count, and edited mark
export const TopicPostDetails: Story = {
	args: { details: ["Nov 10, 2026", "3 min read", "4 hot takes", "edited"] },
	play: async ({ canvas }) => {
		await expect(canvas.getByText("4 hot takes ·")).toBeVisible()
		await expect(canvas.getByText("edited")).toBeVisible()
	},
}

// what follows the details ends the line, so the last detail keeps its dot
export const WithEnding: Story = {
	args: { details: ["Joined November 2026", "20 followers"], children: <span>Blocked</span> },
	play: async ({ canvas }) => {
		await expect(canvas.getByText("20 followers ·")).toBeVisible()
	},
}
