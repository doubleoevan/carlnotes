// team avatar picker tests: the picker shows the photo line under an avatar shown to the leader who uploaded it, and
// no line under a published avatar
import { expect, test } from "bun:test"
import { UNCHECKED_AVATAR_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import { renderToStaticMarkup } from "react-dom/server"
import { TeamAvatarPicker } from "./TeamAvatarPicker"

// a team whose avatar url names the version the picker is given
const TEAM = { teamId: "team-1", name: "Coffee Lab", avatarVersion: "unchecked" }

test("the picker shows the photo line under an avatar shown to its leader alone", () => {
	const uncheckedPickerHtml = renderToStaticMarkup(
		<TeamAvatarPicker team={TEAM} isAvatarUnchecked onAvatarChange={() => {}} />,
	)
	expect(uncheckedPickerHtml).toContain('src="/api/team-avatars/team-1?v=unchecked"')
	expect(uncheckedPickerHtml).toContain(UNCHECKED_AVATAR_TEXT)
})

test("the picker shows no line under a published avatar", () => {
	const publishedPickerHtml = renderToStaticMarkup(<TeamAvatarPicker team={TEAM} onAvatarChange={() => {}} />)
	expect(publishedPickerHtml).not.toContain(UNCHECKED_AVATAR_TEXT)
})
