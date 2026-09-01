// the user profile api client
import type { ProfileResponse, UserSearchResult } from "@shared/contracts"

// a user's public profile by id, or null if there is no such user
export async function fetchProfile(userId: string): Promise<ProfileResponse | null> {
	const response = await fetch(`/api/profiles/${encodeURIComponent(userId)}`)
	return response.ok ? ((await response.json()) as ProfileResponse) : null
}

// set the signed-in user's username. returns null on success, or which rule rejected it on failure
export async function sendUsername(username: string): Promise<string | null> {
	const response = await fetch("/api/usernames", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username }),
	})
	if (response.ok) {
		return null
	}
	const body = (await response.json()) as { error?: string }
	return body.error ?? "taken"
}

// upload an avatar image. returns null on success, or which rule rejected it on failure
export async function uploadAvatar(file: File): Promise<string | null> {
	const body = new FormData()
	body.append("avatar", file)
	const response = await fetch("/api/avatars", { method: "POST", body })
	if (response.ok) {
		return null
	}
	// an unsupported type or an oversized upload names its rule. a missing error falls back to unsupported-type
	return ((await response.json()) as { error?: string }).error ?? "unsupported-type"
}

// use the generated initials or the provider photo. the photo stays private until this asks for it
export async function sendAvatarSource(avatarSource: "generated" | "oauth"): Promise<void> {
	const body = new FormData()
	body.append("avatarSource", avatarSource)
	const response = await fetch("/api/avatars", { method: "POST", body })
	if (!response.ok) {
		throw new Error(`avatar source change failed: ${response.status}`)
	}
}

// return users whose name contains the query for the search bar.
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
	try {
		const response = await fetch(`/api/users?q=${encodeURIComponent(query)}`)
		return response.ok ? ((await response.json()) as { users: UserSearchResult[] }).users : []
	} catch {
		return []
	}
}

// close the signed-in user's own account. throws an error on a rejection so the account page can say it failed
export async function sendDeleteAccount(): Promise<void> {
	const response = await fetch("/api/users/me", { method: "DELETE" })
	if (!response.ok) {
		throw new Error(`account delete failed: ${response.status}`)
	}
}

// a Team Up menu option from the api: a user's team and their team member status
export type TeamMenuOption = {
	teamId: string
	name: string
	hasAvatar: boolean
	role: "leader" | "member"
	status: "member" | "invited" | "none"
	inviteId: string | null
	// whether the user may delete the invitation: a team leader can delete any. a team member can only delete their own.
	canDeleteInvite: boolean
}

// the user's teams with this profile's status in each, for the Team Up menu
export async function fetchTeamOptions(profileUserId: string): Promise<TeamMenuOption[]> {
	const response = await fetch(`/api/profiles/${profileUserId}/team-up`)
	if (!response.ok) {
		throw new Error(`team-up menu failed: ${response.status}`)
	}
	return ((await response.json()) as { teams: TeamMenuOption[] }).teams
}

// set who may invite the user: anyone, connected senders, or nobody
export async function sendInviteAccess(inviteAccess: "anyone" | "connected" | "nobody"): Promise<void> {
	const response = await fetch("/api/users/me/invite-access", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ inviteAccess }),
	})
	if (!response.ok) {
		throw new Error(`invite-access update failed: ${response.status}`)
	}
}
