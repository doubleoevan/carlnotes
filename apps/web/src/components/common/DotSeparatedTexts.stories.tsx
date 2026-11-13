// a row's details texts: a podcast episode's kind, age, and listeners on one line, and the same texts wrapping one at
// a time in a narrow line
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { DotSeparatedTexts } from "./DotSeparatedTexts"

const meta = {
	title: "Common/DotSeparatedTexts",
	component: DotSeparatedTexts,
	args: { texts: ["Podcast", "4 days ago", "14 listeners"] },
	decorators: [
		(Story) => (
			<div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof DotSeparatedTexts>

export default meta
type Story = StoryObj<typeof meta>

// the texts on one line, a dot before each after the first
export const Default: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Podcast")).toBeVisible()
		await expect(canvas.getByText("· 14 listeners")).toBeVisible()
	},
}

// a narrow line, where each text moves down whole with its dot
export const Narrow: Story = {
	decorators: [
		(Story) => (
			<div className="w-28">
				<Story />
			</div>
		),
	],
}
