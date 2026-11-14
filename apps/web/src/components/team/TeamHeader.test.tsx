// team header tests: the leader who uploaded an unchecked avatar sees it in the team's avatar's place with the photo
// line, and a leader with none unchecked sees the team's avatar with no line
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as auth from "@carlnotes/client/authClient"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import { UNCHECKED_AVATAR_TEXT } from "@carlnotes/core/lib/uncheckedImageCopy"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { TeamHeader } from "./TeamHeader"

// put the auth client back after each test
afterEach(() => {
	mock.restore()
})

// the header's markup for a leader of the team, signed in
function renderLeaderTeamHeader(teamPageFields: Partial<TeamPageResponse>): Promise<string> {
	spyOn(auth, "authClient").mockReturnValue({
		useSession: () => ({ data: { user: { id: "user-carl" } }, isPending: false }),
	} as ReturnType<typeof auth.authClient>)
	return renderWithRouter(
		<QueryClientProvider client={new QueryClient()}>
			<TeamHeader
				teamPage={toTestTeamPage({ role: "leader", avatarVersion: "published", ...teamPageFields })}
				noteCount={0}
				isSignedIn
				onChanged={() => {}}
				onInviteOpen={() => {}}
				onOpenChat={() => {}}
				topicButton={null}
			/>
		</QueryClientProvider>,
	)
}

test("the leader who uploaded an unchecked avatar sees it in the header with the photo line", async () => {
	const headerHtml = await renderLeaderTeamHeader({ uncheckedAvatarVersion: "unchecked" })
	expect(headerHtml).toContain('src="/api/team-avatars/team-coffee-lab?v=unchecked"')
	expect(headerHtml).toContain(UNCHECKED_AVATAR_TEXT)
})

test("a leader with no unchecked avatar sees the team's avatar with no line", async () => {
	const headerHtml = await renderLeaderTeamHeader({})
	expect(headerHtml).toContain('src="/api/team-avatars/team-coffee-lab?v=published"')
	expect(headerHtml).not.toContain(UNCHECKED_AVATAR_TEXT)
})
