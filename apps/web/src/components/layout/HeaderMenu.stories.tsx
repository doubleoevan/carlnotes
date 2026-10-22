// the header's phone-only hamburger menu: the theme, then a visitor's links or the signed-in user's pages
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { fn } from "storybook/test"
import { STORY_ADMIN, STORY_USER } from "../../../.storybook/fixtures"
import { seedWaitingUpdates } from "../../../.storybook/fixtures/waitingUpdates"
import { findVisibleByRole } from "../../../.storybook/play"
import { useToolbarTheme } from "../../../.storybook/useToolbarTheme"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"
import { HeaderMenu } from "./HeaderMenu"

const meta = {
	title: "Layout/HeaderMenu",
	component: HeaderMenu,
	// the docs page is wider than a phone, where the trigger hides, so the component stays off it
	tags: ["!autodocs"],
	args: {
		isDark: false,
		onToggleTheme: fn(),
		isSignedIn: false,
		isAdmin: false,
		userId: "",
		onPlayTopicTutorialVideo: fn(),
	},
	argTypes: {
		// the toolbar's theme sets isDark, as the html element's dark class sets it in the app
		isDark: { control: false },
		isSignedIn: { control: "boolean" },
		isAdmin: { control: "boolean" },
		userId: { control: "text" },
		onToggleTheme: { control: false },
		onPlayTopicTutorialVideo: { control: false },
	},
	// the trigger hides from 640 pixels up, so every story renders on a 375-pixel-wide phone
	globals: PHONE_VIEWPORT_GLOBALS,
	// the trigger sits at the right end of the header's dark hero band
	parameters: { surface: "hero" },
	// the theme row offers the theme the toolbar is not on, and a click reports the toggle and switches the toolbar's theme
	render: function Render(args) {
		// the toolbar's theme, and the toggle that reports the click and switches it
		const { isDark, toggleTheme } = useToolbarTheme(args.onToggleTheme)
		return <HeaderMenu {...args} isDark={isDark} onToggleTheme={toggleTheme} />
	},
	// every story opens the menu from the trigger, whose name starts with "Menu" and then lists any waiting updates
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: /^Menu/ }))
	},
} satisfies Meta<typeof HeaderMenu>

export default meta
type Story = StoryObj<typeof meta>

// a visitor's menu: the theme, the video, the docs, plans, log in, and the sign-up call to action
export const Visitor: Story = {}

// a signed-in user's menu: the theme, then their pages, plans, the video, the docs, and sign out
export const User: Story = {
	args: { isSignedIn: true, userId: STORY_USER.userId },
	parameters: { session: "user" },
}

// an admin's menu, which adds the admin console above sign out
export const Admin: Story = {
	args: { isSignedIn: true, isAdmin: true, userId: STORY_ADMIN.userId },
	parameters: { session: "admin" },
	play: async (context) => {
		// the menu fades in, so the admin link is visible once the fade ends
		await meta.play(context)
		await findVisibleByRole("link", { name: "Admin" })
	},
}

// waiting updates: one summed badge on the trigger, and each row's own count in the menu
export const WithUpdates: Story = {
	args: { isSignedIn: true, userId: STORY_USER.userId },
	parameters: { session: "user" },
	beforeEach: seedWaitingUpdates,
}

// the dark theme, where the first row offers light mode
export const DarkTheme: Story = { globals: { theme: "dark" } }
