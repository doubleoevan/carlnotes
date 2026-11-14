// the account page's profile fields in their card: the avatar beside the username over the username form, and the
// line of an upload shown to the user alone, beside the avatar on a wide screen and under its row on a phone
import { UNCHECKED_AVATAR_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { CARD_CLASS } from "@/lib/styleClasses"
import { STORY_SESSIONS, STORY_USER, type StorySession } from "../../../.storybook/fixtures"
import { StorySessionContext } from "../../../.storybook/mocks/authClient"
import { DESKTOP_VIEWPORT_GLOBALS, PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"
import { ProfileFields } from "./AccountSettings"

// the story user's session while an avatar upload of theirs is unchecked
const UNCHECKED_AVATAR_SESSION: StorySession | null = STORY_SESSIONS.user && {
	...STORY_SESSIONS.user,
	user: { ...STORY_SESSIONS.user.user, uncheckedAvatarKey: `avatars/${STORY_USER.userId}/unchecked-version.png` },
}

const meta = {
	title: "Account/ProfileFields",
	component: ProfileFields,
	parameters: { session: "user" },
	args: { userId: STORY_USER.userId, username: STORY_USER.username, className: "mt-3" },
	// the account page's card around the fields
	decorators: [
		(Story) => (
			<section className={CARD_CLASS}>
				<h3 className="font-semibold">Café</h3>
				{Story()}
			</section>
		),
	],
} satisfies Meta<typeof ProfileFields>

export default meta
type Story = StoryObj<typeof meta>

// the avatar beside the username, with no unchecked upload
export const Default: Story = {}

// an upload shown to the user alone on a wide screen: the line sits beside the avatar, under the username
export const UncheckedPhoto: Story = {
	globals: DESKTOP_VIEWPORT_GLOBALS,
	decorators: [
		(Story) => <StorySessionContext.Provider value={UNCHECKED_AVATAR_SESSION}>{Story()}</StorySessionContext.Provider>,
	],
	play: async ({ canvas }) => {
		const uncheckedLineBox = canvas.getByText(UNCHECKED_AVATAR_TEXT).getBoundingClientRect()
		const avatarBox = canvas.getByLabelText("Change your avatar").getBoundingClientRect()
		const usernameBox = canvas.getByText(STORY_USER.username).getBoundingClientRect()
		await expect(uncheckedLineBox.left).toBeGreaterThanOrEqual(avatarBox.right)

		// the line sits close under the username, so its box starts inside the username's line and ends below it
		await expect(uncheckedLineBox.top).toBeGreaterThan(usernameBox.top)
		await expect(uncheckedLineBox.bottom).toBeGreaterThan(usernameBox.bottom)
	},
}

// the unchecked upload on a phone: the line takes the card's width under the avatar's row
export const UncheckedPhotoOnPhone: Story = {
	...UncheckedPhoto,
	globals: PHONE_VIEWPORT_GLOBALS,
	play: async ({ canvas }) => {
		const uncheckedLineBox = canvas.getByText(UNCHECKED_AVATAR_TEXT).getBoundingClientRect()
		const avatarBox = canvas.getByLabelText("Change your avatar").getBoundingClientRect()
		await expect(uncheckedLineBox.top).toBeGreaterThanOrEqual(avatarBox.bottom)
		await expect(Math.round(uncheckedLineBox.left)).toBe(Math.round(avatarBox.left))
	},
}
