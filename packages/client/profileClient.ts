// the user profile api client
import type { ProfileResponse, ProfileTeamStatus } from "@carlnotes/contracts/profiles"
import type { UserSearchResult } from "@carlnotes/contracts/search"
import { apiClient, readApiErrorMessage, toApiUrl } from "./apiClient"

// a user's public profile by id, or null if there is no such user
export async function fetchProfile(userId: string): Promise<ProfileResponse | null> {
	const response = await apiClient().api.profiles[":userId"].$get({ param: { userId } })
	return response.ok ? ((await response.json()) as ProfileResponse) : null
}

// set the signed-in user's username. returns null on success, or which rule rejected it on failure
export async function sendUsername(username: string): Promise<string | null> {
	const response = await apiClient().api.usernames.$post({ json: { username } })
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
	const response = await fetch(toApiUrl("/api/avatars"), { method: "POST", body })
	if (response.ok) {
		return null
	}
	// an unsupported type or an oversized upload names its rule. a missing error falls back to unsupported-type
	return (await readApiErrorMessage(response)) ?? "unsupported-type"
}

// report an avatar file nothing could decode, by its content type and byte size
export async function sendAvatarDecodeFailure(avatarDecodeFailure: {
	contentType: string
	byteSize: number
}): Promise<void> {
	await apiClient()
		.api.avatars["decode-failures"].$post({ json: avatarDecodeFailure })
		.catch(() => undefined)
}

// use the generated initials or the provider photo. the photo stays private until this asks for it
export async function sendAvatarSource(avatarSource: "generated" | "oauth"): Promise<void> {
	const body = new FormData()
	body.append("avatarSource", avatarSource)
	const response = await fetch(toApiUrl("/api/avatars"), { method: "POST", body })
	if (!response.ok) {
		throw new Error(`avatar source change failed: ${response.status}`)
	}
}

// return users whose name contains the query for the search bar.
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
	try {
		const response = await fetch(toApiUrl(`/api/users?q=${encodeURIComponent(query)}`))
		return response.ok ? ((await response.json()) as { users: UserSearchResult[] }).users : []
	} catch {
		return []
	}
}

// close the signed-in user's own account. throws an error on a rejection so the account page can show it failed
export async function sendDeleteAccount(): Promise<void> {
	const response = await fetch(toApiUrl("/api/users/me"), { method: "DELETE" })
	if (!response.ok) {
		throw new Error(`account delete failed: ${response.status}`)
	}
}

// the user's teams, each with the profile user's status there
export async function fetchProfileTeamStatuses(profileUserId: string): Promise<ProfileTeamStatus[]> {
	const response = await fetch(toApiUrl(`/api/profiles/${encodeURIComponent(profileUserId)}/team-statuses`))
	if (!response.ok) {
		throw new Error(`profile team statuses load failed: ${response.status}`)
	}
	return ((await response.json()) as { teams: ProfileTeamStatus[] }).teams
}

// set who may invite the user: anyone, connected senders, or nobody
export async function sendInviteAccess(inviteAccess: "anyone" | "connected" | "nobody"): Promise<void> {
	const response = await apiClient().api.users.me["invite-access"].$post({ json: { inviteAccess } })
	if (!response.ok) {
		throw new Error(`invite-access update failed: ${response.status}`)
	}
}
