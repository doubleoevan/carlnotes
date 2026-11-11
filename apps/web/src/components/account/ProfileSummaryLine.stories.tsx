// the line under a profile's name, with and without the page's counts and the user block
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { FIXTURE_DATE } from "../../../.storybook/fixtures"
import { ProfileSummaryLine } from "./ProfileSummaryLine"

// a profile the user has not blocked
const PROFILE = { joinedAt: FIXTURE_DATE.toISOString(), subscriberCount: 20, isBlocked: false }

const meta = {
	title: "Account/ProfileSummaryLine",
	component: ProfileSummaryLine,
	args: { profile: PROFILE, topicCount: 5, podcastEpisodeCount: 9, teamCount: 2 },
} satisfies Meta<typeof ProfileSummaryLine>

export default meta
type Story = StoryObj<typeof meta>

// the topics, podcast episodes, and teams follow the followers
export const Default: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByText("5 topics ·")).toBeVisible()
		await expect(canvas.getByText("9 podcast episodes ·")).toBeVisible()
		await expect(canvas.getByText("2 teams")).toBeVisible()
	},
}

// a count of zero is left out, and so is a topic count that has not loaded
export const SomeZero: Story = {
	args: { topicCount: null, podcastEpisodeCount: 0, teamCount: 1 },
	play: async ({ canvas }) => {
		await expect(canvas.getByText("1 team")).toBeVisible()
		await expect(canvas.queryByText(/podcast episode/)).toBeNull()
	},
}

// a page with no topics, podcast episodes, or teams keeps the joined date and the followers
export const AllZero: Story = {
	args: { topicCount: 0, podcastEpisodeCount: 0, teamCount: 0 },
	play: async ({ canvas }) => {
		await expect(canvas.getByText("20 followers")).toBeVisible()
	},
}

// a profile the user blocked links to the account page's list
export const Blocked: Story = {
	args: { profile: { ...PROFILE, isBlocked: true } },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("link", { name: "Blocked" })).toHaveAttribute("href", "/account#blocked-people")
	},
}
