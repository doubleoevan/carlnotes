// entry point for `bun run db:seed`. creates the dev demo user through a real Better Auth signup,
// passing the same turnstile-gate cookie that any password signup would, then it seeds demo topics for it
import { eq } from "drizzle-orm"
import { db } from "../db"
import { users } from "../db/schema"
import { seed as seedTopics } from "../db/seed"
import { auth, GATE_COOKIE_NAME, signGateToken } from "./auth"

// fixed local credentials so the seeded demo topics are always reachable by logging in as the same account
const DEV_USER_EMAIL = Bun.env.DEV_USER_EMAIL ?? "evan@carlnotes.dev"
const DEV_USER_PASSWORD = Bun.env.DEV_USER_PASSWORD ?? "dev-password-change-me"

if (import.meta.main) {
	await seed()
}

// resolves or creates the dev demo user through a real signup, then it seeds demo topics for it
export async function seed(): Promise<void> {
	// refuse to seed outside of the dev Doppler environment
	if (process.env.DOPPLER_ENVIRONMENT !== "dev") {
		const seen = process.env.DOPPLER_ENVIRONMENT ?? "unset"
		throw new Error(`db:seed refuses to run: DOPPLER_ENVIRONMENT is "${seen}", expected "dev"`)
	}
	const devUserId = await ensureDevUser()
	await seedTopics(devUserId)
}

// looks up the dev user by email, signing up for real if it doesn't exist yet.
// local dev then exercises the same signup and session path as production
async function ensureDevUser(): Promise<string> {
	const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEV_USER_EMAIL))
	if (existing) {
		return existing.id
	}

	// bind a turnstile-gate cookie the same way the real signup form would after a passing check
	const headers = new Headers({ cookie: `${GATE_COOKIE_NAME}=${await signGateToken()}` })
	// signs up for real. create.before provisions a litellm key, same as any user
	const created = await auth.api.signUpEmail({
		body: { email: DEV_USER_EMAIL, password: DEV_USER_PASSWORD, name: "Evan" },
		headers,
	})
	return created.user.id
}
