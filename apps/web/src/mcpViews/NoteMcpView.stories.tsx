// the note MCP view: a page's Tasting Notes section, or one opened note, as read_notes and save_note show them. a story
// has no host
import { MCP_VIEW_META_KEY, type McpViewData, type McpViewNotes } from "@carlnotes/contracts/mcpViews"
import { NOTE_FORMATS_HTML, TEST_NOTES, toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { setMcpViewData } from "./mcpViewHost"
import { NoteMcpView } from "./NoteMcpView"

// the MCP view data of a visitor's read and of a user's
const VISITOR_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }
const USER_MCP_VIEW_DATA: McpViewData = {
	session: { userId: "user-carl", username: "carl", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [],
}

// a public topic's notes as a visitor reads them, who may create none, and as a user who may create them
const VISITOR_NOTES: McpViewNotes = {
	pageType: "topic",
	pageId: "topic-1",
	notesResponse: { pageName: "Pour-over coffee", creatableVisibilities: [], notes: TEST_NOTES },
	openedNote: null,
}
const USER_NOTES: McpViewNotes = {
	...VISITOR_NOTES,
	notesResponse: { ...VISITOR_NOTES.notesResponse, creatableVisibilities: ["private", "public"] },
}

// another person's note, opened read-only with every format the reader draws
const OPENED_NOTE = toTestNote({
	html: NOTE_FORMATS_HTML,
	canEdit: false,
	isNoteOwner: false,
	canDelete: false,
	owner: { id: "user-vienna", username: "vienna" },
})

// how the MCP view differs from the note's page, which the MCP view cannot match
const DIFFERENCES_FROM_THE_PAGE = [
	"The MCP view differs from the note's page in four ways.",
	"Add Note and a creator's invitation open the page on the site.",
	"A row's press opens its note through the host in place of the dialog.",
	"The opened note is read-only. Edit on CarlNotes sits where the dialog's expand and close controls sit, the owner sees the visibility with no select, and there is no save status, report, or delete.",
	"It shows no comment thread or comments toggle.",
].join(" ")

const meta = {
	title: "MCP Apps/MCP views/NoteMcpView",
	component: NoteMcpView,
	parameters: { surface: "page", docs: { description: { component: DIFFERENCES_FROM_THE_PAGE } } },
} satisfies Meta<typeof NoteMcpView>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's list: the notes table, with Add Note opening sign-up
export const Visitor: Story = {
	args: { mcpViewNotes: VISITOR_NOTES },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: VISITOR_MCP_VIEW_DATA }),
	parameters: { session: "visitor" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: TEST_NOTES[0]?.name })).toBeVisible()
		await expect(canvas.getByRole("link", { name: "Add Note" })).toHaveAttribute(
			"href",
			expect.stringContaining("/signup"),
		)
	},
}

// a user's list, with Add Note opening the page on the site
export const SignedIn: Story = {
	args: { mcpViewNotes: USER_NOTES },
	beforeEach: () => setMcpViewData({ [MCP_VIEW_META_KEY]: USER_MCP_VIEW_DATA }),
	parameters: { session: "user" },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("link", { name: "Add Note" })).not.toHaveAttribute(
			"href",
			expect.stringContaining("/signup"),
		)
	},
}

// a page with no note shows the creator's invitation
export const Empty: Story = {
	...SignedIn,
	args: { mcpViewNotes: { ...USER_NOTES, notesResponse: { ...USER_NOTES.notesResponse, notes: [] } } },
	play: undefined,
}

// a visitor's opened note: the name, byline, and body, with Edit on CarlNotes and no comments toggle
export const VisitorOpenedNote: Story = {
	...Visitor,
	args: { mcpViewNotes: { ...VISITOR_NOTES, openedNote: OPENED_NOTE } },
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { name: OPENED_NOTE.name })).toBeVisible()
		await expect(canvas.getByRole("link", { name: "Edit on CarlNotes" })).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Show comments" })).toBeNull()
	},
}

// a user's own opened note on a team page, with its visibility and no select
export const SignedInOpenedNote: Story = {
	...SignedIn,
	args: {
		mcpViewNotes: {
			...USER_NOTES,
			pageType: "team",
			pageId: "team-1",
			openedNote: { ...OPENED_NOTE, visibility: "team", isNoteOwner: true },
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("link", { name: "Edit on CarlNotes" })).toHaveAttribute(
			"href",
			expect.stringContaining("/teams/team-1"),
		)
		await expect(canvas.getByText("Team", { exact: true })).toBeVisible()
		await expect(canvas.queryByRole("combobox", { name: "Note visibility" })).toBeNull()
	},
}
