// the line under a profile's name, with and without the screen's counts and the user block
import type { Meta, StoryObj } from "@storybook/react-native"
import { ProfileSummaryLine } from "./ProfileSummaryLine"

// a profile the user has not blocked
const PROFILE = { joinedAt: "2026-08-14T12:00:00Z", subscriberCount: 20, isBlocked: false }

const meta: Meta<typeof ProfileSummaryLine> = {
	title: "Account/ProfileSummaryLine",
	component: ProfileSummaryLine,
	parameters: { webReference: "apps/web/src/components/account/ProfileSummaryLine.stories.tsx at 375px" },
	args: { profile: PROFILE, topicCount: 5, podcastEpisodeCount: 9, teamCount: 2 },
}

export default meta
type Story = StoryObj<typeof meta>

// the topics, podcast episodes, and teams follow the followers
export const Default: Story = {}

// a count of zero is left out, and so is a topic count that has not loaded
export const SomeZero: Story = { args: { topicCount: null, podcastEpisodeCount: 0, teamCount: 1 } }

// a screen with no topics, podcast episodes, or teams keeps the joined date and the followers
export const AllZero: Story = { args: { topicCount: 0, podcastEpisodeCount: 0, teamCount: 0 } }

// a profile the user blocked links to the account page's list
export const Blocked: Story = { args: { profile: { ...PROFILE, isBlocked: true } } }
