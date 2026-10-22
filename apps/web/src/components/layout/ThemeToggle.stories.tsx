// the header's theme toggle: a ghost icon button whose icon and tooltip name the mode it switches to
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, screen } from "storybook/test"
import { useToolbarTheme } from "../../../.storybook/useToolbarTheme"
import { ThemeToggle } from "./ThemeToggle"

const meta = {
	title: "Layout/ThemeToggle",
	component: ThemeToggle,
	args: { isDark: false, onToggle: fn() },
	argTypes: {
		// the toolbar's theme sets isDark, as the html element's dark class sets it in the app
		isDark: { control: false },
		onToggle: { control: false },
	},
	// the toggle sits on the header's dark hero band
	parameters: { surface: "hero" },
	// the icon names the theme the toolbar is not on, and a click reports the toggle and switches the toolbar's theme
	render: function Render(args) {
		// the toolbar's theme, and the toggle that reports the click and switches it
		const { isDark, toggleTheme } = useToolbarTheme(args.onToggle)
		return <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
	},
} satisfies Meta<typeof ThemeToggle>

export default meta
type Story = StoryObj<typeof meta>

// the toolbar's theme, light by default, where the moon offers dark mode
export const Light: Story = {}

// the dark theme, where the sun offers light mode
export const Dark: Story = { globals: { theme: "dark" } }

// the tooltip that keyboard focus opens, naming the mode a click switches to
export const Focused: Story = {
	play: async ({ globals, userEvent }) => {
		// focus the toggle, then check that the tooltip names the theme the toolbar is not on
		await userEvent.tab()
		const themeMode = globals.theme === "dark" ? "Light mode" : "Dark mode"
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(themeMode)
	},
}
