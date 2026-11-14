// a profile's sections: another person's public topics and teams, their profile with no public topics or teams, and
// the user's own profile with their topics, with a team topic another member owns, and with none
import { fetchProfileNews } from "@carlnotes/client/newsClient"
import { TEST_OWN_PROFILE_TOPICS } from "@carlnotes/contracts/activityTestFixtures"
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
export const OwnTopics: Story = {
	args: { isOwnProfile: true, profile: toTestProfile({ ownTopics: TEST_OWN_PROFILE_TOPICS }) },
}
export const OwnNoTopics: Story = {
	args: { isOwnProfile: true, profile: toTestProfile({ ownTopics: [], topics: [], teams: [] }) },
}
