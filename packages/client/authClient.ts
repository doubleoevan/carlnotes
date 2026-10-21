// the Better Auth client, the signed-in user's identity from the session, and the signup-gate call for password signups

import type { auth } from "@carlnotes/api/auth"
import { toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { inferAdditionalFields } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { apiClient } from "./apiClient"

// the types-only server import adds the role and plan columns to the session user's type.
// in the browser, the client sends its /api/auth requests to the page's own origin
export const authClient = createAuthClient({
	plugins: [inferAdditionalFields<typeof auth>()],
})

/**
 * Returns the signed-in user's identity for a profile link, read from the session.
 */
export function toSessionProfileIdentity(sessionUser: typeof authClient.$Infer.Session.user): ProfileIdentity {
	return {
		userId: sessionUser.id,
		username: sessionUser.username ?? "",
		avatarSource: sessionUser.avatarSource ?? null,
		avatarVersion: toAvatarVersion(sessionUser),
	}
}

// verifies the turnstile token, then sets the short-lived gate cookie that the signup route reads once the signup
export async function passSignupGate(turnstileToken: string): Promise<{ ok: true } | { error: string }> {
	const response = await apiClient().api["signup-gate"].$post({ json: { turnstileToken } })
	return response.ok ? { ok: true } : ((await response.json()) as { error: string })
}
