// the signed-in user's own avatar picker: the avatar at rest, and the line under an upload shown to the user alone,
// at the account settings' size and at a page header's
import { UNCHECKED_AVATAR_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { PAGE_AVATAR_CLASS } from "@/lib/pageHeaderClasses"
import { STORY_SESSIONS, STORY_USER, type StorySession } from "../../../.storybook/fixtures"
import { StorySessionContext } from "../../../.storybook/mocks/authClient"
import { UserAvatarPicker } from "./UserAvatarPicker"

// the story user's session while an avatar upload of theirs is unchecked
const UNCHECKED_AVATAR_SESSION: StorySession | null = STORY_SESSIONS.user && {
	...STORY_SESSIONS.user,
	user: { ...STORY_SESSIONS.user.user, uncheckedAvatarKey: `avatars/${STORY_USER.userId}/unchecked-version.png` },
}

const meta = {
	title: "Avatar/UserAvatarPicker",
	component: UserAvatarPicker,
	parameters: { session: "user" },
	args: { userId: STORY_USER.userId, username: STORY_USER.username },
	// the account settings' identity row and the profile header both size the picker's box to its avatar
	decorators: [(Story) => <div className="w-fit">{Story()}</div>],
} satisfies Meta<typeof UserAvatarPicker>

export default meta
type Story = StoryObj<typeof meta>

// the avatar at rest, with the camera overlay on hover
export const Default: Story = {}

// an upload shown to the user alone until its check passes, at the account settings' size: the line wraps under the
// avatar, no narrower than 5rem
export const UncheckedPhoto: Story = {
	decorators: [
		(Story) => <StorySessionContext.Provider value={UNCHECKED_AVATAR_SESSION}>{Story()}</StorySessionContext.Provider>,
	],
	play: async ({ canvas }) => {
		const uncheckedLine = canvas.getByText(UNCHECKED_AVATAR_TEXT)
		await expect(uncheckedLine).toBeVisible()
		const avatarBox = canvas.getByLabelText("Change your avatar").getBoundingClientRect()
		await expect(uncheckedLine.getBoundingClientRect().top).toBeGreaterThanOrEqual(avatarBox.bottom)
	},
}

// the unchecked upload at a page header's avatar size, where the line is as wide as the avatar, so the avatar's box
// keeps its size
export const UncheckedPhotoInPageHeader: Story = {
	...UncheckedPhoto,
	args: { className: PAGE_AVATAR_CLASS },
	play: async ({ canvas }) => {
		const uncheckedLineBox = canvas.getByText(UNCHECKED_AVATAR_TEXT).getBoundingClientRect()
		const avatarBox = canvas.getByLabelText("Change your avatar").getBoundingClientRect()
		await expect(uncheckedLineBox.top).toBeGreaterThanOrEqual(avatarBox.bottom)
		await expect(Math.round(uncheckedLineBox.width)).toBeLessThanOrEqual(Math.round(avatarBox.width))
	},
}
