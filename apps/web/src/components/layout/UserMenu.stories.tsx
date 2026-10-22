// the wide-screen user menu: the signed-in user's avatar, badged with waiting updates, opening a dropdown of their pages
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { STORY_ADMIN, STORY_USER } from "../../../.storybook/fixtures"
import { seedWaitingUpdates } from "../../../.storybook/fixtures/waitingUpdates"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { findVisibleByRole, type StoryPlayContext } from "../../../.storybook/play"
import { UserMenu } from "./UserMenu"

// the dropdown portals out of an inline story, so each story that opens it gets its own docs frame, tall enough for it
const DROPDOWN_DOCS = toOwnFrameDocs(480)

// open the dropdown from the avatar, whose name starts with "User menu" and then lists any waiting updates
async function openUserMenu({ canvas, userEvent }: StoryPlayContext<Story>): Promise<void> {
	await userEvent.click(canvas.getByRole("button", { name: /^User menu/ }))
}

const meta = {
	title: "Layout/UserMenu",
	component: UserMenu,
	args: {
		userId: STORY_USER.userId,
		username: STORY_USER.username,
		avatarVersion: null,
		isAdmin: false,
		onPlayTopicTutorialVideo: fn(),
	},
	// the header passes the session user's id, username, and avatar version, so the story's session sets them
	argTypes: {
		userId: { control: false },
		username: { control: false },
		avatarVersion: { control: false },
		isAdmin: { control: "boolean" },
		onPlayTopicTutorialVideo: { control: false },
	},
	// the header renders the menu only for a signed-in user, and the avatar sits at the right end of the header's dark
	// hero band
	parameters: { session: "user", surface: "hero" },
} satisfies Meta<typeof UserMenu>

export default meta
type Story = StoryObj<typeof meta>

// the avatar at rest, its initials on a tinted circle
export const Closed: Story = {}

// the user's dropdown: their pages, plans, the video, the docs, and sign out
export const Open: Story = { parameters: { docs: DROPDOWN_DOCS }, play: openUserMenu }

// an admin's dropdown, which adds the admin console above sign out
export const AdminOpen: Story = {
	args: { userId: STORY_ADMIN.userId, username: STORY_ADMIN.username, isAdmin: true },
	parameters: { session: "admin", docs: DROPDOWN_DOCS },
	play: async (context) => {
		// the dropdown fades in, so the admin link is visible once the fade ends
		await openUserMenu(context)
		await findVisibleByRole("link", { name: "Admin" })
	},
}

// waiting updates: one summed badge on the avatar, and each row's own count in the dropdown
export const WithUpdates: Story = {
	// every story shares the badge stores, so the story's own docs frame also keeps its seed from the rest
	parameters: { docs: DROPDOWN_DOCS },
	beforeEach: seedWaitingUpdates,
	play: openUserMenu,
}

// the dropdown on the user's own profile page, whose row shows the selected tint
export const OnProfilePage: Story = {
	parameters: { docs: DROPDOWN_DOCS, tanstack: { router: { route: { path: `/profiles/${STORY_USER.userId}` } } } },
	play: openUserMenu,
}
