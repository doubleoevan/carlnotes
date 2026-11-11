// a profile page's and a team page's visitors line: a count in the thousands, a small count, and the empty line before
// the first read
import { fetchProfileViewerCounts, fetchTeamViewerCounts } from "@carlnotes/client/viewerCountsClient"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, mocked } from "storybook/test"
import { ViewerCountLine } from "./ViewerCountLine"

const meta = {
	title: "Common/ViewerCountLine",
	component: ViewerCountLine,
	args: { viewerCountPage: { kind: "profile", id: "user-1" } },
	// the counts each read returns, so no story reaches the api
	beforeEach: () => {
		mocked(fetchProfileViewerCounts).mockResolvedValue({ viewerCount: 1284 })
		mocked(fetchTeamViewerCounts).mockResolvedValue({ viewerCount: 12 })
	},
} satisfies Meta<typeof ViewerCountLine>

export default meta
type Story = StoryObj<typeof meta>

// a profile's visitors, in the thousands with the separator
export const Profile: Story = {
	play: async ({ canvas }) => {
		await expect(await canvas.findByText("Visitors:")).toBeVisible()
		await expect(canvas.getByText("1,284")).toBeVisible()
	},
}

// a public team's visitors
export const Team: Story = {
	args: { viewerCountPage: { kind: "team", id: "team-1", isPublic: true } },
	play: async ({ canvas }) => {
		await expect(await canvas.findByText("12")).toBeVisible()
	},
}

// a read that returns nothing leaves the line empty at its one line of height
export const Empty: Story = {
	beforeEach: () => {
		mocked(fetchProfileViewerCounts).mockResolvedValue(null)
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByText("Visitors:")).toBeNull()
	},
}
