// the LiteLLM proxy admin api: each user's budgeted key, its replacement, its spend, and the reset on the first

import { isAdminRole } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { userBudgetCents } from "@shared/plans"
import { and, eq, isNotNull, lt } from "drizzle-orm"
import { db } from "../db"
import { startOfUtcMonth } from "../db/quotas"
import { users } from "../db/schema"

/**
 * Create a virtual key for a user at their monthly budget. It has no window of its own; the sweep
 * replaces it on the first.
 */
export async function provisionLiteLLMKey(email: string, budgetCents: number): Promise<string> {
	// ask the proxy for a budgeted key aliased to the user's email and the creation time
	const { baseURL, masterKey } = litellmConfig()
	const response = await fetch(`${baseURL}/key/generate`, {
		method: "POST",
		headers: authHeaders(masterKey),
		// the key is the user's, aliased to their email and the creation time, at their budget in dollars
		body: JSON.stringify({
			user_id: email,
			key_alias: `user:${email}:${Date.now()}`,
			max_budget: budgetCents / 100,
		}),
	})
	// surface a specific failure instead of an opaque parse error downstream
	if (!response.ok) {
		throw new Error(`litellm key/generate failed: ${response.status} ${await response.text()}`)
	}
	const { key } = (await response.json()) as { key: string }
	return key
}

/**
 * Retire a virtual key, so its remaining allowance can never be spent after it is replaced.
 */
export async function deleteLiteLLMKey(key: string): Promise<void> {
	// point the proxy's /key/delete at the retired key
	const { baseURL, masterKey } = litellmConfig()
	const response = await fetch(`${baseURL}/key/delete`, {
		method: "POST",
		headers: authHeaders(masterKey),
		body: JSON.stringify({ keys: [key] }),
	})
	// surface a specific failure so a key left live is visible, not silent
	if (!response.ok) {
		throw new Error(`litellm key/delete failed: ${response.status} ${await response.text()}`)
	}
}

/**
 * Read a key's spend this month, in dollars, or null when the proxy is unreachable or the key is unknown.
 */
export async function readLiteLLMKeySpend(key: string): Promise<number | null> {
	try {
		// /key/info reports the authoritative spend LiteLLM recorded for this key
		const { baseURL, masterKey } = litellmConfig()
		const response = await fetch(`${baseURL}/key/info?key=${encodeURIComponent(key)}`, {
			headers: authHeaders(masterKey),
		})
		// an unknown key reads as unknown spend
		if (!response.ok) {
			return null
		}
		const { info } = (await response.json()) as { info?: { spend?: number } }
		return info?.spend ?? null
	} catch {
		// a network failure reads as unknown spend
		return null
	}
}

/**
 * Replace the user's key with a fresh one at their current budget. Returns whether it was replaced.
 */
export async function replaceUserLiteLLMKey(userId: string): Promise<boolean> {
	// the key it replaces and the email the new one is aliased to
	const [user] = await db
		.select({
			email: users.email,
			litellmVirtualKey: users.litellmVirtualKey,
			// what the user's budget is computed from
			role: users.role,
			plan: users.plan,
			budgetOverrideCents: users.budgetOverrideCents,
		})
		.from(users)
		.where(eq(users.id, userId))

	// a user whose key was never created has nothing to replace
	if (!user?.litellmVirtualKey) {
		return true
	}

	// the budget the new key is sized to
	const budgetCents = userBudgetCents({
		isAdmin: isAdminRole(user.role),
		plan: user.plan,
		budgetOverrideCents: user.budgetOverrideCents,
	})

	// the new key is stored before the old one is retired, so a store that fails leaves the user on the old key
	try {
		const replacementKey = await provisionLiteLLMKey(user.email, budgetCents)
		try {
			await db
				.update(users)
				.set({ litellmVirtualKey: replacementKey, litellmKeyCreatedAt: new Date() })
				.where(eq(users.id, userId))
		} catch (error) {
			// the db update failed to store the new key, so delete it from the proxy
			await deleteLiteLLMKey(replacementKey)
			throw error
		}
		// the new key is stored, so an old one the proxy would not retire is reported, not a failure
		await deleteLiteLLMKey(user.litellmVirtualKey).catch((error: unknown) => {
			console.error(`litellm could not retire the old key for user ${userId}`, error)
			reportError(error, "chat", { userId })
		})
		return true
	} catch (error) {
		// a proxy failure must not throw. the old key stays, sized to the old budget
		console.error(`litellm key replace failed for user ${userId}`, error)
		reportError(error, "chat", { userId, budgetCents: String(budgetCents) })
		return false
	}
}

// how many keys the monthly reset replaced, and how many it could not
export type BudgetResetSummary = { replaced: number; failed: number }

/**
 * Replace every key created before the current month began, so each user's budget starts the month at zero. One
 * attempt per user: a failure is reported, and that user's key is tried again by the next sweep.
 */
export async function resetMonthlyBudgets(): Promise<BudgetResetSummary> {
	// the users whose key predates the month. a user with no key has nothing to reset
	const dueUsers = await db
		.select({ id: users.id })
		.from(users)
		.where(and(isNotNull(users.litellmVirtualKey), lt(users.litellmKeyCreatedAt, startOfUtcMonth(new Date()))))

	// each replacement is its own attempt, and a failed one leaves the row for the next sweep
	const resetSummary: BudgetResetSummary = { replaced: 0, failed: 0 }
	for (const user of dueUsers) {
		const isReplaced = await replaceUserLiteLLMKey(user.id).catch((error: unknown) => {
			// a read that fails before the replacement starts is this user's failure, never the reset's
			console.error(`monthly budget reset could not replace the key for user ${user.id}`, error)
			reportError(error, "scheduled-scan", { userId: user.id })
			return false
		})
		resetSummary[isReplaced ? "replaced" : "failed"]++
	}
	return resetSummary
}

// the proxy base url and master key, required for every admin call
function litellmConfig(): { baseURL: string; masterKey: string } {
	const baseURL = Bun.env.LITELLM_BASE_URL
	const masterKey = Bun.env.LITELLM_MASTER_KEY
	if (!baseURL || !masterKey) {
		throw new Error("LITELLM_BASE_URL and LITELLM_MASTER_KEY must be set to manage user keys")
	}
	return { baseURL, masterKey }
}

// the master-key auth headers for the proxy admin api
function authHeaders(masterKey: string): Record<string, string> {
	return { Authorization: `Bearer ${masterKey}`, "Content-Type": "application/json" }
}
