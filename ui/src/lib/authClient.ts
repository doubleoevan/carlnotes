// the Better Auth client, and the signup-gate call the password path makes before it.
// same-origin: in dev vite forwards /api to the Hono server, and in prod one service serves both the ui and the api
import { createAuthClient } from "better-auth/react"
import { hc } from "hono/client"
import type { AppType } from "../../../api"

export const authClient = createAuthClient({ baseURL: window.location.origin })

const client = hc<AppType>(window.location.origin)

// verifies the turnstile token, then sets the short-lived gate cookie create.before reads once the
// signup call that follows this actually completes. oauth signup never calls this at all
export async function passSignupGate(turnstileToken: string): Promise<{ ok: true } | { error: string }> {
	const response = await client.api["signup-gate"].$post({ json: { turnstileToken } })
	return response.ok ? { ok: true } : ((await response.json()) as { error: string })
}
