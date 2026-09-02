// the typed api client for the team routes
import {
	type CreateTeamPayload,
	type Invite,
	type InviteSource,
	inviteCreateResponse,
	type TeamPageResponse,
	type TeamSearchResult,
	type TeamsPageResponse,
	type UpdateTeamPayload,
} from "@shared/contracts"
import { hc } from "hono/client"
import { refreshAvatars } from "@/hooks/useAvatarVersion"
import type { AppType } from "../../../api"

// same-origin api client. in dev vite forwards /api to the Hono server
const apiClient = hc<AppType>(window.location.origin)

// how creating a team was rejected, for the modal to show which way it went
export type CreateTeamRejection = "quota" | "name-taken"

// fetch the teams the user belongs to, for the teams page
export async function fetchTeams(): Promise<TeamsPageResponse> {
	const response = await apiClient.api.teams.$get()
	if (!response.ok) {
		throw new Error(`teams load failed: ${response.status}`)
	}
	return (await response.json()) as TeamsPageResponse
}

// delete one of the user's own sent team invitations
export async function sendDeleteTeamInvite(teamId: string, inviteId: string): Promise<void> {
	const response = await apiClient.api.teams[":id"].invites[":inviteId"].$delete({
		param: { id: teamId, inviteId },
	})
	if (!response.ok) {
		throw new Error(`team invite delete failed: ${response.status}`)
	}
}

// fetch one team page by id. return gated or missing if there is no page to show
export type TeamPageResult =
	| { status: "visible"; team: TeamPageResponse }
	| { status: "gated"; teamName: string; hasRequestedToJoin: boolean }
	| { status: "missing" }

export async function fetchTeamPage(teamId: string): Promise<TeamPageResult> {
	const response = await apiClient.api.teams[":id"].page.$get({ param: { id: teamId } })
	if (response.ok) {
		return { status: "visible", team: (await response.json()) as TeamPageResponse }
	}

	// a private team returns only its name, so its page can offer an outsider a way in. the value is checked instead of trusted
	const body = (await response.json().catch(() => null)) as { teamName?: unknown; hasRequestedToJoin?: unknown } | null
	return typeof body?.teamName === "string"
		? { status: "gated", teamName: body.teamName, hasRequestedToJoin: body.hasRequestedToJoin === true }
		: { status: "missing" }
}

// create a team, returning the new team's id or which way it was rejected
export async function sendCreateTeam(
	payload: CreateTeamPayload,
): Promise<{ teamId: string } | { rejection: CreateTeamRejection }> {
	const response = await apiClient.api.teams.$post({ json: payload })
	if (response.ok) {
		// the id names both the new page and where an avatar upload goes
		const created = (await response.json()) as { teamId: string }
		return { teamId: created.teamId }
	}
	// a taken name is reported by status, and the plan limit is the other rejection
	return { rejection: response.status === 409 ? "name-taken" : "quota" }
}

// the leader's team edits: name, description, and the public toggle
export async function sendUpdateTeam(teamId: string, payload: UpdateTeamPayload): Promise<"name-taken" | null> {
	const response = await apiClient.api.teams[":id"].$patch({ param: { id: teamId }, json: payload })
	return response.status === 409 ? "name-taken" : null
}

// whether a team name is already taken, for the form's on-blur check. the save still enforces for real
export async function fetchTeamNameTaken(name: string): Promise<boolean> {
	const response = await apiClient.api.teams["name-check"].$get({ query: { name } })
	if (!response.ok) {
		return false
	}
	return ((await response.json()) as { isTaken: boolean }).isTaken
}

// delete the team, returning its topics to their creators. false if it is the only team the user leads
export async function sendDeleteTeam(teamId: string): Promise<boolean> {
	const response = await apiClient.api.teams[":id"].$delete({ param: { id: teamId } })
	return response.ok
}

// add a user's topic to a team, returning the conflict message if it is already on a team
export async function sendAddTopicTeam(teamId: string, topicId: string): Promise<string | null> {
	const response = await apiClient.api.teams[":id"].topics.$post({ param: { id: teamId }, json: { topicId } })
	if (response.ok) {
		return null
	}
	const body = (await response.json().catch(() => null)) as { error?: string } | null
	return body?.error ?? "That topic didn't get added. Try again."
}

// remove a topic from the team
export async function sendRemoveTopicFromTeam(teamId: string, topicId: string): Promise<void> {
	await apiClient.api.teams[":id"].topics[":topicId"].$delete({ param: { id: teamId, topicId } })
}

// set a team member's role, returning false if the last-leader rule held it
export async function sendTeamMemberRole(teamId: string, userId: string, role: "leader" | "member"): Promise<boolean> {
	const response = await apiClient.api.teams[":id"].members[":userId"].role.$post({
		param: { id: teamId, userId },
		json: { role },
	})
	return response.ok
}

// remove a team member or leave, returning false if the last-leader rule held it
export async function sendRemoveTeamMember(teamId: string, userId: string): Promise<boolean> {
	const response = await apiClient.api.teams[":id"].members[":userId"].$delete({ param: { id: teamId, userId } })
	return response.ok
}

// the team member's own visibility opt-out on one team
export async function setTeamMemberVisibility(teamId: string, userId: string, isMemberVisible: boolean): Promise<void> {
	await apiClient.api.teams[":id"].members[":userId"]["member-visibility"].$post({
		param: { id: teamId, userId },
		json: { isMemberVisible },
	})
}

// create an invite link for a team
export async function sendCreateTeamInvite(teamId: string, source: InviteSource): Promise<Invite> {
	const response = await apiClient.api.teams[":id"].invites.$post({ param: { id: teamId }, json: { source } })
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { error?: string } | null
		throw new Error(body?.error ?? `invite create failed: ${response.status}`)
	}
	return inviteCreateResponse.parse(await response.json()).invite
}

// upload a team's avatar. leader only, and a team with none shows its initials until one is uploaded
export async function sendTeamAvatar(teamId: string, avatarFile: File): Promise<string | null> {
	const body = new FormData()
	body.append("avatar", avatarFile)
	const response = await fetch(`/api/teams/${teamId}/avatar`, { method: "POST", body })
	if (response.ok) {
		// every rendered copy of this team's avatar re-fetches
		refreshAvatars()
		return null
	}

	// the refusal names itself, so the picker can show which way it went
	const refusal = ((await response.json().catch(() => null)) as { error?: string } | null)?.error
	return refusal ?? "failed"
}

// the public teams a query finds, for the search bar's team suggestions
export async function searchTeams(query: string): Promise<TeamSearchResult[]> {
	const response = await apiClient.api.teams.search.$get({ query: { q: query } })
	if (!response.ok) {
		return []
	}
	return ((await response.json()) as { teams: TeamSearchResult[] }).teams
}

// ask to join a team, which a leader answers from their team page
export async function sendJoinRequest(teamId: string): Promise<boolean> {
	const response = await apiClient.api.teams[":id"]["join-requests"].$post({ param: { id: teamId } })
	return response.ok
}

// take back the user's own request, removing the row the leaders see
export async function sendDeleteJoinRequest(teamId: string): Promise<void> {
	await apiClient.api.teams[":id"]["join-requests"].me.$delete({ param: { id: teamId } })
}

// admit a requester, a leader's power. limited means the members list is already at its limit
export async function sendApproveJoinRequest(teamId: string, userId: string): Promise<"joined" | "limited" | "failed"> {
	const response = await apiClient.api.teams[":id"]["join-requests"][":userId"].approve.$post({
		param: { id: teamId, userId },
	})
	if (response.ok) {
		return "joined"
	}
	return response.status === 409 ? "limited" : "failed"
}
