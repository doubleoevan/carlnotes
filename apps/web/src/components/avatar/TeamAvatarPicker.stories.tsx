// the team avatar picker: the team's initials at rest, and the line under an avatar shown to the leader who uploaded
// it, as the Edit team modal draws it
import { UNCHECKED_AVATAR_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn } from "storybook/test"
import { TeamAvatarPicker } from "./TeamAvatarPicker"

const meta = {
	title: "Avatar/TeamAvatarPicker",
	component: TeamAvatarPicker,
	args: {
		team: { teamId: "team-coffee-lab", name: "Coffee Lab", avatarVersion: null },
		onAvatarChange: fn(),
		className: "size-14",
	},
} satisfies Meta<typeof TeamAvatarPicker>

export default meta
type Story = StoryObj<typeof meta>

// a team with no image of its own, at the Edit team modal's size
export const Default: Story = {}

// an avatar shown to this leader alone until its check passes, loaded from the app's own root path, with its line
export const UncheckedPhoto: Story = {
	args: { previewUrl: "/social-avatar-400.png", isAvatarUnchecked: true },
	play: async ({ canvas }) => {
		const uncheckedLine = canvas.getByText(UNCHECKED_AVATAR_TEXT)
		await expect(uncheckedLine).toBeVisible()
		const avatarBox = canvas.getByLabelText("Change the team avatar").getBoundingClientRect()
		await expect(uncheckedLine.getBoundingClientRect().top).toBeGreaterThanOrEqual(avatarBox.bottom)
	},
}
