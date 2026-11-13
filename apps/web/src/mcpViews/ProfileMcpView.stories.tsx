// the profile MCP view: a person's Café as the profile page shows it, from the read_profile tool's result. a story
// has no host
import { MCP_VIEW_META_KEY, type McpViewData, type McpViewProfile } from "@carlnotes/contracts/mcpViews"
import { toProfilePageTitle } from "@carlnotes/contracts/profilePage"
import { toTestProfile } from "@carlnotes/contracts/profileTestFixtures"
import { toNewsStoryPage } from "@carlnotes/core/lib/newsStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { setMcpViewData } from "./mcpViewHost"
import { ProfileMcpView } from "./ProfileMcpView"

// how the MCP view differs from the profile page, which a frame cannot match
const DIFFERENCES_FROM_THE_PAGE = [
	"The MCP view differs from the profile page where a frame cannot do what the page does.",
	"The page's button row is gone: New Topic, New team, and Team Up.",
	"The news shows the tool's first page of the week, with no Week, Day, Hour picker. See all on CarlNotes opens the profile page in place of the page buttons. The rows have no Topic note and no Video pill.",
	"The user's own Café shows the plain avatar with no picker and no update badge, no line from Carl, and the topics and teams as a visitor's tables show them, with no topics loading and no Retry.",
	"The topics table has no Emails switch, and its kept-over-seen count is text with no info popup.",
	"The teams table is read-only: no Invited by, spend, or leave and delete columns, member and topic counts as text with no subtables, and no update badge on a team's name.",
	"A film card has no film button, and a podcast episode card plays the recording the tool result includes.",
	"A Topic Post card opens its post in the MCP view.",
].join(" ")

// the MCP view data of a visitor's read and of the person's own
const VISITOR_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }
const OWN_MCP_VIEW_DATA: McpViewData = {
	session: { userId: "user-carl", username: "carl", avatarSource: "generated", avatarVersion: null },
	podcastEpisodes: [],
}

// a person's Café with two public topics, two teams, and the week's first page of news, which has more pages after it
const PROFILE_STORY: McpViewProfile = { profile: toTestProfile(), newsPage: toNewsStoryPage(1), isOwnProfile: false }

const meta = {
	title: "MCP Apps/MCP views/ProfileMcpView",
	component: ProfileMcpView,
	args: { mcpViewProfile: PROFILE_STORY },
	parameters: { surface: "page", docs: { description: { component: DIFFERENCES_FROM_THE_PAGE } } },
} satisfies Meta<typeof ProfileMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's view of someone's Café: the header, the news with See all, the sections, and the read-only tables
export const Visitor: Story = {
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: VISITOR_MCP_VIEW_DATA }),
	parameters: { session: "visitor" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { level: 1, name: toProfilePageTitle("carl") })).toBeVisible()
		await expect(canvas.getByRole("link", { name: "See all on CarlNotes" })).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Week" })).toBeNull()
		await expect(canvas.getAllByRole("link", { name: /Pour-over coffee/ })[0]).toBeVisible()
		await expect(canvas.queryByRole("switch")).toBeNull()
	},
}

// the user's own Café, with private topics, and no topics loading, avatar picker, or team control
export const OwnCafe: Story = {
	args: {
		mcpViewProfile: {
			...PROFILE_STORY,
			profile: toTestProfile({ includesNonPublicTopics: true }),
			isOwnProfile: true,
		},
	},
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: OWN_MCP_VIEW_DATA }),
	parameters: { session: "user" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("link", { name: toProfilePageTitle("carl") })).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Retry loading topics" })).toBeNull()
		await expect(canvas.queryByRole("switch")).toBeNull()
		await expect(canvas.getAllByRole("link", { name: /Coffee Lab/ })[0]).toBeVisible()
	},
}
