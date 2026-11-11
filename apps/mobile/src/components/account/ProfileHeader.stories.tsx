// the mobile profile header, with the web stories' names
import type { Meta, StoryObj } from "@storybook/react-native"
import { ProfileHeader } from "./ProfileHeader"

// another person's profile, joined a while ago with followers, with no podcast episode cards and no teams
const PROFILE = {
	userId: "user-1",
	username: "Evan",
	avatarVersion: null,
	joinedAt: "2026-06-01T12:00:00.000Z",
	subscriberCount: 20,
	isBlocked: false,
	profilePodcastEpisodes: [],
	teams: [],
}

const meta = {
	title: "Account/ProfileHeader",
	component: ProfileHeader,
	parameters: { webReference: "apps/web/src/components/account/ProfileHeader.stories.tsx at 375px" },
	args: { isOwnProfile: false, topicCount: 5, profile: PROFILE },
} satisfies Meta<typeof ProfileHeader>

export default meta
type Story = StoryObj<typeof meta>

// the heading is the person's name, then Café, with the summary line under it beside the avatar
export const Default: Story = {}

// a person the user blocked says so on the summary line
export const Blocked: Story = { args: { profile: { ...PROFILE, isBlocked: true } } }
