// team members table tests: the footer's cells line up one to one with the header's columns
import { expect, test } from "bun:test"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { TeamMembersTable } from "./TeamMembersTable"

// one active member, which is all the table reads
const members = [
	{
		userId: "user-1",
		username: "ada",
		avatarSource: null,
		avatarVersion: null,
		role: "member",
		isMemberVisible: true,
		isActive: true,
	},
] as unknown as TeamPageResponse["members"]

// a leader's table shows the Active and delete columns, and the member count sits in the Active column alone
test("a leader's footer has one cell per column and the member count under Active", async () => {
	const tableHtml = await renderWithRouter(
		<TeamMembersTable teamId="team-1" members={members} hiddenMemberCount={0} isTeamLeader onChanged={() => {}} />,
	)
	const headerHtml = tableHtml.slice(tableHtml.indexOf("<thead"), tableHtml.indexOf("</thead>"))
	const footerHtml = tableHtml.slice(tableHtml.indexOf("<tfoot"), tableHtml.indexOf("</tfoot>"))
	const headerCells = headerHtml.match(/<th[\s>]/g) ?? []
	const footerCells = [...footerHtml.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(([, text]) => text)

	// five columns, no spanning cell, and the count in the fourth one under Active
	expect(headerCells).toHaveLength(5)
	expect(footerHtml).not.toContain("colspan")
	expect(footerCells).toHaveLength(5)
	expect(footerCells[3]).toBe("1 member")
	expect(footerCells[4]).toBe("")
})
