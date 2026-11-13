// the team MCP view: a team page's header and sections in the page's accordion, and a member's room. a story has no
// host, so Load earlier messages is not pressed
import { MCP_VIEW_META_KEY, type McpViewData, type McpViewTeam } from "@carlnotes/contracts/mcpViews"
import { TEST_NOTES } from "@carlnotes/contracts/noteTestFixtures"
import { toTeamPageTitle } from "@carlnotes/contracts/teams"
import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { toTestChatRoomMessage } from "@/components/chat/chatRoomTestFixtures"
import { setMcpViewData } from "./mcpViewHost"
import { TeamMcpView } from "./TeamMcpView"

// the MCP view data of a visitor's read and of a member's
const VISITOR_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }
const MEMBER_MCP_VIEW_DATA: McpViewData = {
	session: { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [],
}

// the team's notes as a reader who may not write one reads them
const TEAM_NOTES = { pageName: "Coffee Lab", creatableVisibilities: [], notes: TEST_NOTES.slice(0, 3) }

// a visitor reads the public team's public notes with no room
const VISITOR_TEAM: McpViewTeam = {
	teamPage: toTestTeamPage({ role: null }),
	notesResponse: { ...TEAM_NOTES, notes: TEAM_NOTES.notes.filter((note) => note.visibility === "public") },
	chatMessagePage: null,
}

// a member reads the room's newest messages, a reply among them, with older ones above
const MEMBER_TEAM: McpViewTeam = {
	teamPage: toTestTeamPage(),
	notesResponse: { ...TEAM_NOTES, creatableVisibilities: ["private", "team"] },
	chatMessagePage: {
		chatMessages: [
			toTestChatRoomMessage({
				id: 41,
				authorUserId: "user-carl",
				authorUsername: "carl",
				content: "Who has the new burrs?",
			}),
			toTestChatRoomMessage({
				id: 42,
				authorUserId: "user-vienna",
				authorUsername: "vienna",
				content: "Mine came in on Friday.",
				replyToChatMessageId: 41,
			}),
		],
		hasEarlierChatMessages: true,
		isVoiceChatConfigured: false,
	},
}

const meta = {
	title: "MCP Apps/MCP views/TeamMcpView",
	component: TeamMcpView,
	parameters: {
		surface: "page",
		docs: {
			description: {
				component:
					"The team page as an MCP view. It differs from the page in these ways. The header has no button row, " +
					"no avatar picker, and no mention badge. The members table is read-only. The topics table shows its " +
					"email switches disabled and its kept count as text, with no popup. The notes have no Add Note button " +
					"and no dialog, and a note opens the team page on the site. A member's room is a section of the " +
					"accordion, read-only, with a Load earlier messages button in place of scrolling. It has no input, reply, " +
					"delete, report, or play, and a shared file shows its name only. The MCP view has no viewer count and no " +
					"live updates, and it ends with a link to the team page.",
			},
		},
	},
} satisfies Meta<typeof TeamMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's MCP view: the header and sections, with no room
export const Visitor: Story = {
	args: { mcpViewTeam: VISITOR_TEAM },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: VISITOR_MCP_VIEW_DATA }),
	parameters: { session: "visitor" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { level: 1, name: toTeamPageTitle("Coffee Lab") })).toBeVisible()
		await expect(canvas.queryByText("Team chat")).toBeNull()
		await expect(canvas.getByRole("link", { name: "Open on CarlNotes" })).toBeVisible()
	},
}

// a member's MCP view, with the room's newest messages and the Load earlier messages button above them
export const Member: Story = {
	args: { mcpViewTeam: MEMBER_TEAM },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: MEMBER_MCP_VIEW_DATA }),
	parameters: { session: "user" },
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Mine came in on Friday.")).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Load earlier messages" })).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Add Note" })).toBeNull()
	},
}
