// account settings tests: the profile fields show an unchecked photo's line once, in their own identity row, and no
// line with no unchecked upload
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as auth from "@carlnotes/client/authClient"
import { UNCHECKED_AVATAR_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import { renderToStaticMarkup } from "react-dom/server"
import { ProfileFields } from "./AccountSettings"

// put the auth client back after each test
afterEach(() => {
	mock.restore()
})

// the profile fields' markup for user-1, signed in with an unchecked upload if a key is given
function renderProfileFields(uncheckedAvatarKey: string | null): string {
	const sessionUser = { id: "user-1", avatarSource: "generated", avatarKey: null, uncheckedAvatarKey }
	spyOn(auth, "authClient").mockReturnValue({
		useSession: () => ({ data: { user: sessionUser }, isPending: false }),
	} as ReturnType<typeof auth.authClient>)
	return renderToStaticMarkup(<ProfileFields userId="user-1" username="vienna" />)
}

test("the profile fields show an unchecked photo's line once, in the identity row", () => {
	const uncheckedFieldsHtml = renderProfileFields("avatars/user-1/unchecked.png")
	expect(uncheckedFieldsHtml.split(UNCHECKED_AVATAR_TEXT)).toHaveLength(2)
	expect(uncheckedFieldsHtml).toContain('src="/api/avatars/user-1?v=unchecked"')
})

test("the profile fields show no line with no unchecked upload", () => {
	expect(renderProfileFields(null)).not.toContain(UNCHECKED_AVATAR_TEXT)
})
