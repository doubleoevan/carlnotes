// the user profile api client
import type { ProfileResponse, UserSearchResult } from "@shared/contracts"

// a user's public profile by id, or null when there is no such user
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
	// a shape rejection names its rule. anything else is a generic failure
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

// close the signed-in user's own account. throws on a rejection so the account page can say it failed
export async function sendAccountDelete(): Promise<void> {
	const response = await fetch("/api/users/me", { method: "DELETE" })
	if (!response.ok) {
		throw new Error(`account delete failed: ${response.status}`)
	}
}
