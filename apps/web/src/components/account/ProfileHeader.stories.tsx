// the profile header: another person's Café, with the avatar at the height of a topic's image on the Topics page, and
// one the user blocked
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { FIXTURE_DATE } from "../../../.storybook/fixtures"
import { ProfileHeader } from "./ProfileHeader"

// another person's profile, with no podcast episode cards and no teams
const PROFILE = {
	userId: "user-1",
	username: "Evan",
	avatarVersion: null,
	joinedAt: FIXTURE_DATE.toISOString(),
	subscriberCount: 20,
	isBlocked: false,
	profilePodcastEpisodes: [],
	teams: [],
}

const meta = {
	title: "Account/ProfileHeader",
	component: ProfileHeader,
	args: { isOwnProfile: false, topicCount: 5, profile: PROFILE },
} satisfies Meta<typeof ProfileHeader>

export default meta
type Story = StoryObj<typeof meta>

// the heading is the person's name, then Café, with the summary line under it beside the avatar
export const Default: Story = {
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { name: "Evan Café" })).toBeVisible()
		await expect(canvas.getByText(/20 followers/)).toBeVisible()
		await expect(canvas.getByText("5 topics")).toBeVisible()
	},
}

// a person the user blocked says so on the summary line
export const Blocked: Story = {
	args: { profile: { ...PROFILE, isBlocked: true } },
}
