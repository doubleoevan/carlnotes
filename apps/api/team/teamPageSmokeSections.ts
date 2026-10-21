// the team smoke's page sections: the gate a private team's page shows, and the sender and inviter identities

import { db } from "@carlnotes/db"
import { invites } from "@carlnotes/db/schema/invites"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { users } from "@carlnotes/db/schema/users"
import { and, eq } from "drizzle-orm"
import { loadTeamSummaries } from "./helpers"
import { requestToJoinTeam } from "./members"
import { loadTeamPage } from "./teamPage"
import { check, runId, toId } from "./teamSmokeFixtures"
import { loadTeamsPage } from "./teamsPage"

/** 11. A private team's page shows its gate to anyone who may not see it, and the whole page to a member. */
export async function checkTeamPageGate(): Promise<void> {
	console.log("\n=== 11. team page gate ===")
	// the seeded private team, and the name its gate shows
	const teamId = toId("team-roles")
	const teamName = `smoke team-roles ${runId}`

	// a signed-out visitor and a non-member get the gate, with no join request
	const visitorResult = await loadTeamPage(null, teamId)
	check(
		visitorResult.status === "gated" && visitorResult.teamName === teamName && !visitorResult.hasRequestedToJoin,
		"a signed-out visitor gets the gate with the team's name",
	)
	const nonMemberResult = await loadTeamPage(toId("joiner"), teamId)
	check(nonMemberResult.status === "gated" && !nonMemberResult.hasRequestedToJoin, "a non-member gets the gate")

	// a non-member who asked to join sees the request on the gate
	check(await requestToJoinTeam(toId("joiner"), teamId), "the non-member asks to join")
	const requesterResult = await loadTeamPage(toId("joiner"), teamId)
	check(
		requesterResult.status === "gated" && requesterResult.hasRequestedToJoin,
		"the gate shows the non-member's pending request",
	)

	// a member gets the whole page, and an unknown team id is missing
	const teamMemberResult = await loadTeamPage(toId("leader-b"), teamId)
	check(
		teamMemberResult.status === "visible" && teamMemberResult.team.name === teamName,
		"a member gets the whole page",
	)
	check((await loadTeamPage(null, toId("no-such-team"))).status === "missing", "an unknown id is missing")

	// give the team and a member a stored avatar. the keys are never read from storage here
	const teamAvatarKey = `avatars/teams/${teamId}/team-${runId}.png`
	const memberAvatarKey = `avatars/${toId("leader-b")}/member-${runId}.png`
	await db.update(teams).set({ avatarKey: teamAvatarKey }).where(eq(teams.id, teamId))
	await db
		.update(users)
		.set({ avatarSource: "upload", avatarKey: memberAvatarKey })
		.where(eq(users.id, toId("leader-b")))

	// the page names each avatar's version, the id in its key, for the team and for the member
	const avatarPageResult = await loadTeamPage(toId("leader-b"), teamId)
	const avatarMembers = avatarPageResult.status === "visible" ? avatarPageResult.team.members : []
	const leaderMember = avatarMembers.find((member) => member.userId === toId("leader-b"))
	check(
		avatarPageResult.status === "visible" &&
			avatarPageResult.team.avatarVersion === `team-${runId}` &&
			leaderMember?.avatarVersion === `member-${runId}`,
		"the team page names the team's and a member's avatar version",
	)

	// the route returns the gate to a signed-out visitor as a 403 with the team's name and no join request
	const server = (await import("../index")).default
	const gateResponse = await server.fetch(new Request(`http://localhost:3000/api/teams/${teamId}/page`))
	const gateBody = (await gateResponse.json()) as { teamName?: string; hasRequestedToJoin?: boolean }
	check(
		gateResponse.status === 403 && gateBody.teamName === teamName && gateBody.hasRequestedToJoin === false,
		"the page route returns the gate as a 403 with the team's name",
	)

	// a public team's page is whole for a signed-out visitor
	await db.update(teams).set({ isPublic: true }).where(eq(teams.id, teamId))
	check((await loadTeamPage(null, teamId)).status === "visible", "a public team's page is whole for a visitor")
}

/** 12. A received invite names its sender, and a membership names whoever invited the member. */
export async function checkInviteIdentities(): Promise<void> {
	console.log("\n=== 12. sender and inviter identities ===")
	// invite the joiner twice: once from the member who got an avatar in section 11, and once from a closed account
	await db.insert(invites).values([
		{ teamId: toId("team-roles"), invitedUserId: toId("joiner"), invitedByUserId: toId("leader-b") },
		{ teamId: toId("team-limit"), invitedUserId: toId("joiner"), invitedByUserId: null },
	])
	const { receivedInvites } = await loadTeamsPage(toId("joiner"))
	const memberInvite = receivedInvites.find((receivedInvite) => receivedInvite.teamId === toId("team-roles"))
	const closedSenderInvite = receivedInvites.find((receivedInvite) => receivedInvite.teamId === toId("team-limit"))
	check(
		memberInvite?.sender?.userId === toId("leader-b") && memberInvite.sender.avatarVersion === `member-${runId}`,
		"a received invite names its sender and the sender's avatar version",
	)
	check(closedSenderInvite?.sender === null, "an invite whose sender's account closed names no sender")

	// the member invited the joiner into team-hold, and nobody invited the member
	await db
		.update(teamMembers)
		.set({ invitedByUserId: toId("leader-b") })
		.where(and(eq(teamMembers.teamId, toId("team-hold")), eq(teamMembers.userId, toId("joiner"))))

	// read team-hold as the joiner and the member each see it on their teams page
	const joinerTeamSummaries = await loadTeamSummaries(toId("joiner"))
	const memberTeamSummaries = await loadTeamSummaries(toId("member"))
	const invitedTeamSummary = joinerTeamSummaries.find((teamSummary) => teamSummary.teamId === toId("team-hold"))
	const uninvitedTeamSummary = memberTeamSummaries.find((teamSummary) => teamSummary.teamId === toId("team-hold"))
	check(
		invitedTeamSummary?.invitedBy?.userId === toId("leader-b") &&
			invitedTeamSummary.invitedBy.avatarVersion === `member-${runId}`,
		"a membership names its inviter and the inviter's avatar version",
	)
	check(uninvitedTeamSummary?.invitedBy === null, "a membership nobody invited names no inviter")
}
