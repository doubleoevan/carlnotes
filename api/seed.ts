// entry point for `bun run db:seed`
import { eq } from "drizzle-orm"
import { db } from "../db"
import { users } from "../db/schema"
import { seed as seedTopics } from "../db/seed"
import { auth, GATE_COOKIE_NAME, signGateToken } from "./auth"
import { isAdminRole, replaceUserLiteLLMKey } from "./authorization"

// fixed local credentials so the seeded demo topics are always reachable by logging in as the same account
const DEV_USER_EMAIL = Bun.env.DEV_USER_EMAIL ?? "evan@carlnotes.dev"
const DEV_USER_PASSWORD = Bun.env.DEV_USER_PASSWORD ?? "notesofcarl"

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

	// capture the role before seeding, which promotes the dev user to admin with a plain row update
	const devUserId = await ensureDevUser()
	const [devUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, devUserId))
	const wasAdminBeforeSeed = isAdminRole(devUser?.role)
	await seedTopics(devUserId)

	// a key created at signup has the free budget, so a fresh promotion reissues it at the admin limit
	if (!wasAdminBeforeSeed) {
		await replaceUserLiteLLMKey(devUserId)
	}
}

// looks up the dev user by email, signing up for real if it doesn't exist yet
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
