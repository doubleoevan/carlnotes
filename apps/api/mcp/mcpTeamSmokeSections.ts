import { db } from "@carlnotes/db"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { users } from "@carlnotes/db/schema/users"
import { eq, inArray } from "drizzle-orm"
import { checkBoundRejections, checkPageBounds, type SmokeClient } from "./mcpResultSmokeSections"
import { check, insertSmokeUser, ownerId, runId, topicId, toResultJson, withClient } from "./mcpSmokeFixtures"
import { toResultText } from "./toolTestFixtures"

// the owner's team, a team the owner is not on, and the friend the owner invites
const teamId = `${runId}-chat-team`
const otherTeamId = `${runId}-join-team`
const friendId = `${runId}-friend`

// what read_team returns for a visible page
type ReadTeam = { hasRequestedToJoin: boolean; room: { messages: { content: string }[] } | null }

/** Checks the team tools on both routes, with the owner's teams and the friend removed after. */
export async function checkTeamTools(accessToken: string): Promise<void> {
	await seedTeams()
	try {
		// the chat, the ask to join, and the invites on /mcp, then the bound route
		await withClient("/mcp", accessToken, async (client) => {
			await checkTeamChat(client)
			await checkJoinRequest(client)
			await checkInvites(client)
		})
		await withClient(`/mcp/t/${topicId}`, accessToken, checkBoundRoute)
	} finally {
		// the teams take their members and invites with them
		await db.delete(teams).where(inArray(teams.id, [teamId, otherTeamId]))
		await db.delete(users).where(eq(users.id, friendId))
	}
}

// the owner's public team with the owner as its leader, a second public team, and a friend to invite
async function seedTeams(): Promise<void> {
	// the teams, and the owner leading the first
	await db.insert(teams).values([
		{ id: teamId, name: `${runId} team`, isPublic: true },
		{ id: otherTeamId, name: `${runId} other team`, isPublic: true },
	])
	await db.insert(teamMembers).values({ teamId, userId: ownerId, role: "leader" })

	// the friend's account
	await insertSmokeUser(friendId)
}

// the owner posts in the team chat, then lists the team and reads the post back within the result bounds
async function checkTeamChat(client: SmokeClient): Promise<void> {
	// the post
	const message = `${runId} hello`
	const postResult = await client.callTool({ name: "post_to_team_room", arguments: { team_id: teamId, message } })
	check("/mcp: post_to_team_room posts a member's message", !postResult.isError, toResultText(postResult))

	// the team in the owner's list
	const listResult = await client.callTool({ name: "list_teams", arguments: {} })
	const listedTeamIds = toResultJson<{ items: { teamId: string }[] }>(listResult).items.map((team) => team.teamId)
	check("/mcp: list_teams lists the owner's team", listedTeamIds.includes(teamId), listedTeamIds)
	checkPageBounds("/mcp list_teams", listResult)

	// the page with the post in its chat
	const readResult = await client.callTool({ name: "read_team", arguments: { team_id: teamId } })
	const roomMessages = toResultJson<ReadTeam>(readResult).room?.messages ?? []
	check(
		"/mcp: read_team holds the member's post in the chat",
		roomMessages.some((roomMessage) => roomMessage.content.includes(message)),
		roomMessages,
	)
	checkPageBounds("/mcp read_team", readResult)
}

// the owner asks to join the second team, which its page shows, then takes the ask back
async function checkJoinRequest(client: SmokeClient): Promise<void> {
	// the ask, and the page that shows it with no chat
	const askResult = await client.callTool({
		name: "request_to_join_team",
		arguments: { team_id: otherTeamId, is_requesting: true },
	})
	check("/mcp: request_to_join_team asks to join", !askResult.isError, toResultText(askResult))
	const readTeam = toResultJson<ReadTeam>(
		await client.callTool({ name: "read_team", arguments: { team_id: otherTeamId } }),
	)
	check("/mcp: a non-member reads the ask and no chat", readTeam.hasRequestedToJoin && readTeam.room === null, readTeam)

	// the ask taken back
	const takeBackResult = await client.callTool({
		name: "request_to_join_team",
		arguments: { team_id: otherTeamId, is_requesting: false },
	})
	check("/mcp: request_to_join_team takes the ask back", !takeBackResult.isError, toResultText(takeBackResult))
}

// the owner invites the friend by username, and a missing invite answers nothing
async function checkInvites(client: SmokeClient): Promise<void> {
	// a username invite sends no email
	const inviteResult = await client.callTool({
		name: "send_invite",
		arguments: { team_id: teamId, username: friendId },
	})
	check("/mcp: send_invite invites a username", !inviteResult.isError, toResultText(inviteResult))

	// an accept of an invite nobody sent the owner
	const respondResult = await client.callTool({
		name: "respond_to_invite",
		arguments: { invite_id: `${runId}-missing-invite`, is_accepted: true },
	})
	check(
		"/mcp: respond_to_invite answers no missing invite",
		Boolean(respondResult.isError) && toResultText(respondResult) === "No invite waiting for you has that id.",
		toResultText(respondResult),
	)
}

// the bound route reads, posts to, asks to join, and invites to no team
async function checkBoundRoute(client: SmokeClient): Promise<void> {
	// each call that names a team
	const teamToolCalls = [
		{ name: "read_team", arguments: { team_id: teamId } },
		{ name: "post_to_team_room", arguments: { team_id: teamId, message: "bound" } },
		{ name: "request_to_join_team", arguments: { team_id: otherTeamId, is_requesting: true } },
		{ name: "send_invite", arguments: { team_id: teamId, username: friendId } },
	]
	await checkBoundRejections(client, teamToolCalls, "reaches no team")

	// the owner's teams list on the bound route too
	const listResult = await client.callTool({ name: "list_teams", arguments: {} })
	check("bound route: list_teams lists the owner's teams", !listResult.isError, toResultText(listResult))
}
