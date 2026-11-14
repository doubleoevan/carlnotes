// user avatar picker tests: the picker shows the photo line under an upload shown to the user alone, no line with
// none unchecked, and no line of its own if its caller places the line
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as auth from "@carlnotes/client/authClient"
import { UNCHECKED_AVATAR_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import { renderToStaticMarkup } from "react-dom/server"
import { UserAvatarPicker } from "./UserAvatarPicker"

// put the auth client back after each test
afterEach(() => {
	mock.restore()
})

// the picker's markup for user-1, signed in with an unchecked upload if a key is given, with the picker's own
// line unless its caller places the line
function renderUserAvatarPicker(uncheckedAvatarKey: string | null, hasUncheckedLine = true): string {
	const sessionUser = { id: "user-1", avatarSource: "generated", avatarKey: null, uncheckedAvatarKey }
	spyOn(auth, "authClient").mockReturnValue({
		useSession: () => ({ data: { user: sessionUser }, isPending: false }),
	} as ReturnType<typeof auth.authClient>)
	return renderToStaticMarkup(
		<UserAvatarPicker userId="user-1" username="vienna" hasUncheckedLine={hasUncheckedLine} />,
	)
}

test("the picker shows the unchecked upload with the photo line under it", () => {
	const uncheckedPickerHtml = renderUserAvatarPicker("avatars/user-1/unchecked.png")
	expect(uncheckedPickerHtml).toContain('src="/api/avatars/user-1?v=unchecked"')
	expect(uncheckedPickerHtml).toContain(UNCHECKED_AVATAR_TEXT)
})

test("the picker shows no line with no unchecked upload", () => {
	expect(renderUserAvatarPicker(null)).not.toContain(UNCHECKED_AVATAR_TEXT)
})

// the account's profile fields place the line beside the avatar themselves
test("the picker shows the unchecked upload with no line of its own if its caller places the line", () => {
	const uncheckedPickerHtml = renderUserAvatarPicker("avatars/user-1/unchecked.png", false)
	expect(uncheckedPickerHtml).toContain('src="/api/avatars/user-1?v=unchecked"')
	expect(uncheckedPickerHtml).not.toContain(UNCHECKED_AVATAR_TEXT)
})
