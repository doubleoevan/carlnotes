import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, within } from "storybook/test"
import { ChatOptionsMenu, type ChatRoomOption } from "./ChatOptionsMenu"

// a Topic room beside the currently selected Team room
const room: ChatRoomOption = {
	key: "home-espresso",
	name: "Home espresso",
	pageHref: "/topics/home-espresso/home-espresso",
	isActive: false,
	team: { teamId: "coffee-team", name: "Coffee team", avatarVersion: null },
	onSelect: fn(),
}

const meta = {
	title: "Chat/ChatOptionsMenu",
	component: ChatOptionsMenu,
	args: { currentChatRoom: { name: "Coffee team", team: room.team }, chatRoomOptions: [room] },
	parameters: { surface: "card" },
} satisfies Meta<typeof ChatOptionsMenu>

export default meta
type Story = StoryObj<typeof meta>

export const TopicLink: Story = {
	play: async ({ canvas, userEvent }) => {
		// open the picker and reach the Topic link with the keyboard
		const switcher = canvas.getByRole("button", { name: "Coffee team" })
		await userEvent.click(switcher)
		const page = within(document.body)
		const roomButton = await page.findByRole("button", { name: room.name })
		await userEvent.tab()
		await expect(roomButton).toHaveFocus()
		await userEvent.keyboard("{ArrowLeft}")
		const link = await page.findByRole("link", { name: room.name })
		await expect(link).toHaveFocus()
		await expect(link).toHaveAttribute("href", room.pageHref)

		// verify that activating the link preserves the open picker and current chat
		await userEvent.keyboard("{Enter}")
		await expect(room.onSelect).not.toHaveBeenCalled()
		await expect(switcher).toHaveAttribute("aria-expanded", "true")
	},
}
