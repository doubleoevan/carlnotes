// the Better Auth client, and the signup-gate call the password path makes before it
import { inferAdditionalFields } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import type { auth } from "../../../api/auth"
import { apiClient } from "./apiClient"

// the types-only server import adds the role and plan columns to the session user's type.
// in the browser, the client sends its /api/auth requests to the page's own origin
export const authClient = createAuthClient({
	plugins: [inferAdditionalFields<typeof auth>()],
})

// verifies the turnstile token, then sets the short-lived gate cookie that the signup route reads once the signup
export async function passSignupGate(turnstileToken: string): Promise<{ ok: true } | { error: string }> {
	const response = await apiClient.api["signup-gate"].$post({ json: { turnstileToken } })
	return response.ok ? { ok: true } : ((await response.json()) as { error: string })
}
