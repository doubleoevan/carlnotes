// entry point for `bun run db:seed`
import { plans } from "@carlnotes/contracts/enums"
import { GATE_COOKIE_NAME } from "@carlnotes/contracts/signupGate"
import { db } from "@carlnotes/db"
import { users } from "@carlnotes/db/schema/users"
import { seed as seedTopics } from "@carlnotes/db/seed"
import { replaceUserLiteLLMKey } from "@carlnotes/models/litellm"
import { eq } from "drizzle-orm"
import { auth } from "./auth"
import { isAdminRole } from "./authorization"
import { signGateToken } from "./signupGate"

// fixed local credentials so the seeded demo topics are always reachable by logging in as the same account. the plan
// users share the password
const DEV_USER_EMAIL = Bun.env.DEV_USER_EMAIL ?? "evan@carlnotes.dev"
const DEV_USER_PASSWORD = Bun.env.DEV_USER_PASSWORD ?? "notesofcarl"

// the email and display name of a seeded user
type EnsureUserOptions = { email: string; name: string }

if (import.meta.main) {
	await seed()
}

// resolves or creates the dev demo user through a real signup, then it seeds demo topics for it and one user per plan
export async function seed(): Promise<void> {
	// never seed outside of the dev Doppler environment
	if (process.env.DOPPLER_ENVIRONMENT !== "dev") {
		const seen = process.env.DOPPLER_ENVIRONMENT ?? "unset"
		throw new Error(`db:seed will not run: DOPPLER_ENVIRONMENT is "${seen}", expected "dev"`)
	}

	// capture the role before seeding, which promotes the dev user to admin with a plain row update
	const devUserId = await ensureUser({ email: DEV_USER_EMAIL, name: "Evan" })
	const [devUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, devUserId))
	const wasAdminBeforeSeed = isAdminRole(devUser?.role)
	await seedTopics(devUserId)

	// a key created at signup has the free budget, so a fresh promotion reissues it at the admin limit
	if (!wasAdminBeforeSeed) {
		await replaceUserLiteLLMKey(devUserId)
	}
	await seedPlanUsers()
}

// one user per plan, none an admin, at free@, plus@, and premium@carlnotes.dev, so each plan's limits and monthly budget
// cutoffs can be checked by logging in
async function seedPlanUsers(): Promise<void> {
	for (const plan of plans) {
		// sign the plan's user up, then put them on the plan. a plan change reissues the key at the plan's budget
		const userId = await ensureUser({ email: `${plan}@carlnotes.dev`, name: `${plan} tester` })
		const [planUser] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId))
		if (planUser?.plan !== plan) {
			await db.update(users).set({ plan }).where(eq(users.id, userId))
			await replaceUserLiteLLMKey(userId)
		}
	}
}

// looks up a seeded user by email, signing up for real with the dev password if it doesn't exist yet
async function ensureUser({ email, name }: EnsureUserOptions): Promise<string> {
	const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
	if (existingUser) {
		return existingUser.id
	}

	// bind a turnstile-gate cookie the same way the real signup form would after a passing check
	const headers = new Headers({ cookie: `${GATE_COOKIE_NAME}=${await signGateToken()}` })
	// signs up for real with a throwaway password that passes signup's length rule. create.before provisions a LiteLLM
	// key, same as any user
	const created = await auth.api.signUpEmail({
		body: { email, password: crypto.randomUUID(), name },
		headers,
	})

	// then saves the dev password, which is shorter than that rule allows. sign-in never checks the length
	const authContext = await auth.$context
	await authContext.internalAdapter.updatePassword(created.user.id, await authContext.password.hash(DEV_USER_PASSWORD))
	return created.user.id
}
