// team subtables tests: whose role the members subtable's leader controls follow
import { expect, test } from "bun:test"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { TeamSubtablesRow } from "./TeamSubtablesRow"

// a loaded team page with one member, which is all the members subtable reads
const teamPage = {
	members: [
		{
			userId: "user-1",
			username: "ada",
			avatarSource: null,
			avatarVersion: null,
			role: "member",
			isMemberVisible: true,
			isActive: true,
		},
	],
	hiddenMemberCount: 0,
	topics: [],
} as unknown as TeamPageResponse

// the members subtable's markup for a row with the given role, on the user's own teams page or someone else's profile
async function toMembersSubtableHtml({ isReadOnly }: { isReadOnly: boolean }): Promise<string> {
	return renderWithRouter(
		<table>
			<tbody>
				<TeamSubtablesRow
					teamId="team-1"
					teamRole="leader"
					isReadOnly={isReadOnly}
					openSubtable="members"
					teamPage={teamPage}
					columnCount={6}
					onChanged={() => {}}
				/>
			</tbody>
		</table>,
	)
}

// a read-only row's leader role is the profile user's. the user gets no role select and no removal
test("a read-only team row shows no leader controls, and the user's own leader row does", async () => {
	const readOnlyHtml = await toMembersSubtableHtml({ isReadOnly: true })
	expect(readOnlyHtml).toContain("ada")
	expect(readOnlyHtml).not.toContain('aria-label="ada role"')
	expect(readOnlyHtml).not.toContain('aria-label="Remove ada from the team"')

	// the user's own leader row keeps them
	const leaderHtml = await toMembersSubtableHtml({ isReadOnly: false })
	expect(leaderHtml).toContain('aria-label="ada role"')
	expect(leaderHtml).toContain('aria-label="Remove ada from the team"')
})
