import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { NoteUnreadBadge } from "./NoteUnreadBadge"

// compare the native adapter with its shared web content in both Nightshift themes
const meta: Meta<typeof NoteUnreadBadge> = {
	title: "Note/NoteUnreadBadge",
	component: NoteUnreadBadge,
	args: { unreadEdits: 1, unreadComments: 2 },
}
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Outline: Story = { args: { isOutline: true } }
export const Many: Story = { args: { unreadComments: 12 } }
export const Empty: Story = { args: { unreadEdits: 0, unreadComments: 0 } }
