// profile page tests: the empty topics and teams sections on someone else's profile
import { expect, test } from "bun:test"
import type { ProfileResponse } from "@carlnotes/contracts/profiles"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { ProfileSections } from "./ProfilePage"

// someone else's profile with no public topics and no public teams
const emptyProfile: ProfileResponse = {
	userId: "user-2",
	username: "lin",
	avatarSource: "initials",
	avatarVersion: null,
	joinedAt: "2026-07-01T00:00:00.000Z",
	subscriberCount: 0,
	includesNonPublicTopics: false,
	topics: [],
	teams: [],
}

// the open topics section shows a muted line in the same style as the teams section, never a blank section
test("someone else's profile with no topics says so, as it does for no teams", async () => {
	const html = await renderWithRouter(
		<ProfileSections
			profile={emptyProfile}
			isOwnProfile={false}
			topics={null}
			isTopicsLoadFailed={false}
			onLoadTopics={() => {}}
			onReloadProfile={() => {}}
		/>,
	)
	expect(html).toContain('<p class="text-muted-foreground text-sm">No public topics.</p>')
	expect(html).toContain('<p class="text-muted-foreground text-sm">No public teams.</p>')
})
