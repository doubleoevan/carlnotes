import { TEST_OWN_PROFILE_TOPICS } from "@carlnotes/contracts/activityTestFixtures"
import { toTestProfile } from "@carlnotes/contracts/profileTestFixtures"
import { EMPTY_NEWS_STORY } from "@carlnotes/core/lib/newsStories"
import type { Meta, StoryObj } from "@storybook/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ProfileSections } from "./ProfileSections"

// a query client whose news for the profile reads as empty, so no story reaches the api
function toStoryQueryClient(profileUserId: string): QueryClient {
	const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
	queryClient.setQueryData(["news", profileUserId, null, "week", 1], EMPTY_NEWS_STORY)
	return queryClient
}

// another person's public topics and teams, their profile with neither, and the user's own profile with their topics,
// with a team topic another member owns, and with none, as on the web
const meta: Meta<typeof ProfileSections> = {
	title: "Account/ProfileSections",
	component: ProfileSections,
	parameters: { webReference: "account-profilesections--visitor" },
	args: {
		profile: toTestProfile(),
		isOwnProfile: false,
		onReload: () => undefined,
	},
	decorators: [
		(Story, { args }) => (
			<QueryClientProvider client={toStoryQueryClient(args.profile?.userId ?? "")}>
				<Story />
			</QueryClientProvider>
		),
	],
}
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
