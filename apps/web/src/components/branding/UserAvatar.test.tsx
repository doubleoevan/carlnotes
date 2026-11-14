// user avatar tests: the signed-in user's own avatar draws at the version of an upload shown to them alone, and
// another person's avatar keeps the version it was given
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as auth from "@carlnotes/client/authClient"
import { renderToStaticMarkup } from "react-dom/server"
import { UserAvatar } from "./UserAvatar"

// put the auth client back after each test
afterEach(() => {
	mock.restore()
})

// sign user-1 in with a published upload, and with an unchecked upload if a key is given
function signInWithUncheckedAvatar(uncheckedAvatarKey: string | null): void {
	const sessionUser = {
		id: "user-1",
		avatarSource: "upload",
		avatarKey: "avatars/user-1/published.png",
		uncheckedAvatarKey,
	}
	spyOn(auth, "authClient").mockReturnValue({
		useSession: () => ({ data: { user: sessionUser }, isPending: false }),
	} as ReturnType<typeof auth.authClient>)
}

test("the signed-in user's own avatar draws their unchecked upload, wherever it is drawn", () => {
	signInWithUncheckedAvatar("avatars/user-1/unchecked.png")
	const ownAvatarHtml = renderToStaticMarkup(<UserAvatar userId="user-1" username="vienna" avatarVersion="published" />)
	expect(ownAvatarHtml).toContain('src="/api/avatars/user-1?v=unchecked"')
})

test("another person's avatar keeps its own version while the signed-in user has an unchecked upload", () => {
	signInWithUncheckedAvatar("avatars/user-1/unchecked.png")
	const otherAvatarHtml = renderToStaticMarkup(<UserAvatar userId="user-2" username="carlos" avatarVersion="theirs" />)
	expect(otherAvatarHtml).toContain('src="/api/avatars/user-2?v=theirs"')
})

test("the signed-in user's own avatar draws the published upload with none unchecked", () => {
	signInWithUncheckedAvatar(null)
	const ownAvatarHtml = renderToStaticMarkup(<UserAvatar userId="user-1" username="vienna" avatarVersion={null} />)
	expect(ownAvatarHtml).toContain('src="/api/avatars/user-1?v=published"')
})
