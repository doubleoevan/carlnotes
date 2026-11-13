// a profile's sections: another person's public topics and teams, their profile with no public topics or teams, and
// the user's own profile while its topics load and after they fail
import { fetchProfileNews } from "@carlnotes/client/newsClient"
import { TEST_OWNER_TOPICS } from "@carlnotes/contracts/activityTestFixtures"
import { toTestProfile } from "@carlnotes/contracts/profileTestFixtures"
import { EMPTY_NEWS_STORY } from "@carlnotes/core/lib/newsStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn, mocked } from "storybook/test"
import { ProfileSections } from "./ProfileSections"

const meta = {
	title: "Account/ProfileSections",
	component: ProfileSections,
	args: {
		profile: toTestProfile(),
		isOwnProfile: false,
		topics: null,
		isTopicsLoadFailed: false,
		onLoadTopics: fn(),
		onReloadProfile: fn(),
	},
	// the news reads as empty, so no story reaches the api
	beforeEach: () => {
		mocked(fetchProfileNews).mockResolvedValue(EMPTY_NEWS_STORY)
	},
} satisfies Meta<typeof ProfileSections>
export default meta
type Story = StoryObj<typeof meta>
export const Visitor: Story = {}
export const VisitorEmpty: Story = { args: { profile: toTestProfile({ topics: [], teams: [] }) } }
export const OwnTopics: Story = { args: { isOwnProfile: true, topics: TEST_OWNER_TOPICS } }
export const OwnTopicsLoading: Story = { args: { isOwnProfile: true } }
export const OwnTopicsLoadFailed: Story = { args: { isOwnProfile: true, isTopicsLoadFailed: true } }
export const OwnNoTopics: Story = { args: { isOwnProfile: true, topics: [], profile: toTestProfile({ teams: [] }) } }
