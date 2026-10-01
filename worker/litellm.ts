// load the LiteLLM key that is billed for a user's model calls, and create the key if the user has none.
// create, replace, delete, and read a user's budgeted key through the proxy admin api, and run the monthly reset

import { isAdminRole } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { userBudgetCents } from "@shared/plans"
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm"
import { db } from "../db"
import { startOfUtcMonth } from "../db/quotas"
import { users } from "../db/schema"
import { runWithConcurrency } from "./concurrency"

// how many key replacements the reset runs against the proxy at once
const MONTHLY_BUDGET_RESET_CONCURRENCY = 4

// how long a proxy admin call may run before it counts as failed
const LITELLM_ADMIN_TIMEOUT_MS = 5000

// a key's recorded spend and its maximum budget in dollars. a key with no maximum budget has a null budget
export type LiteLLMKeyBudget = { spendDollars: number; maxBudgetDollars: number | null }

// a user's stored key, and the email and budget that a new key for the user is created with
type LiteLLMKeyOwner = { email: string; litellmVirtualKey: string | null; budgetCents: number }

/**
 * Loads the key billed for a user's model calls. Creates and stores a key at the user's budget if the user has none.
 * Throws an error if the user is gone, or if the key cannot be created or stored.
 */
export async function loadOrProvisionUserLiteLLMKey(userId: string): Promise<string> {
	// throw an error if the user is gone, and return the stored key if the user has a key
	const litellmKeyOwner = await loadLiteLLMKeyOwner(userId)
	if (!litellmKeyOwner) {
		throw new Error(`user ${userId} not found`)
	}
	if (litellmKeyOwner.litellmVirtualKey) {
		return litellmKeyOwner.litellmVirtualKey
	}

	// create a key at the user's budget
	const provisionedLiteLLMKey = await provisionLiteLLMKey(litellmKeyOwner.email, litellmKeyOwner.budgetCents)

	// store the key only if no other call stored a key first. the creation time keeps the key out of this month's reset
	const updatedUserIds = await db
		.update(users)
		.set({ litellmVirtualKey: provisionedLiteLLMKey, litellmKeyCreatedAt: new Date() })
		.where(and(eq(users.id, userId), isNull(users.litellmVirtualKey)))
		.returning({ id: users.id })
		.catch(async (error: unknown) => {
			// the store failed, so delete the created key and throw the store's error
			await deleteUnstoredLiteLLMKey(userId, provisionedLiteLLMKey)
			throw error
		})
	if (updatedUserIds.length > 0) {
		return provisionedLiteLLMKey
	}

	// another call stored a key first, so delete this call's key and return the stored key
	await deleteUnstoredLiteLLMKey(userId, provisionedLiteLLMKey)
	return loadOrProvisionUserLiteLLMKey(userId)
}

// delete a created key that was not stored. a failed delete is reported instead of throwing an error
async function deleteUnstoredLiteLLMKey(userId: string, key: string): Promise<void> {
	await deleteLiteLLMKey(key).catch((error: unknown) => {
		console.error(`litellm could not delete the unstored key for user ${userId}`, error)
		reportError(error, "billing", { userId })
	})
}

/**
 * Whether the user's stored key has spent its whole budget. False if the user has no key or the budget read fails.
 * The proxy rejects a model call on a key whose budget is spent.
 */
export async function isUserLiteLLMKeyBudgetExhausted(userId: string): Promise<boolean> {
	// return false if the user has no stored key
	const litellmKeyOwner = await loadLiteLLMKeyOwner(userId)
	if (!litellmKeyOwner?.litellmVirtualKey) {
		return false
	}

	// compare the key's recorded spend with its maximum budget. a budget with no maximum is never spent
	const litellmKeyBudget = await readLiteLLMKeyBudget(litellmKeyOwner.litellmVirtualKey)
	return (
		litellmKeyBudget?.maxBudgetDollars != null && litellmKeyBudget.spendDollars >= litellmKeyBudget.maxBudgetDollars
	)
}

/**
 * Creates a virtual key for a user at the user's monthly budget. The proxy never resets the key's spend on its own.
 * The spend starts again at zero only when the monthly budget reset or a plan or budget change replaces the key.
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
		signal: AbortSignal.timeout(LITELLM_ADMIN_TIMEOUT_MS),
	})
	// log the proxy's response body and throw an error that names only the status
	if (!response.ok) {
		console.error(`litellm key/generate failed: ${response.status}`, await response.text())
		throw new Error(`litellm key/generate failed: ${response.status}`)
	}
	const { key } = (await response.json()) as { key: string }
	return key
}

/**
 * Deletes a virtual key from the proxy, so nothing can spend what is left of its budget.
 */
export async function deleteLiteLLMKey(key: string): Promise<void> {
	// ask the proxy to delete the key
	const { baseURL, masterKey } = litellmConfig()
	const response = await fetch(`${baseURL}/key/delete`, {
		method: "POST",
		headers: authHeaders(masterKey),
		body: JSON.stringify({ keys: [key] }),
		signal: AbortSignal.timeout(LITELLM_ADMIN_TIMEOUT_MS),
	})
	// log the proxy's response body and throw an error that names only the status
	if (!response.ok) {
		console.error(`litellm key/delete failed: ${response.status}`, await response.text())
		throw new Error(`litellm key/delete failed: ${response.status}`)
	}
}

/**
 * Deletes a user's stored LiteLLM key from the proxy.
 */
export async function deleteUserLiteLLMKey(userId: string): Promise<void> {
	// delete the user's stored key from the proxy if the user has a key
	const litellmKeyOwner = await loadLiteLLMKeyOwner(userId)
	if (litellmKeyOwner?.litellmVirtualKey) {
		await deleteLiteLLMKey(litellmKeyOwner.litellmVirtualKey)
	}
}

/**
 * Reads a key's recorded spend and maximum budget.
 * Returns null if the proxy is unreachable, times out, or does not know the key.
 */
export async function readLiteLLMKeyBudget(key: string): Promise<LiteLLMKeyBudget | null> {
	try {
		// ask the proxy for the key's recorded spend and maximum budget
		const { baseURL, masterKey } = litellmConfig()
		const response = await fetch(`${baseURL}/key/info?key=${encodeURIComponent(key)}`, {
			headers: authHeaders(masterKey),
			signal: AbortSignal.timeout(LITELLM_ADMIN_TIMEOUT_MS),
		})
		// a failed response, such as for a key that the proxy does not know, reads as an unknown budget
		if (!response.ok) {
			return null
		}

		// return the spend and the maximum budget. a response with no spend reads as an unknown budget
		const { info } = (await response.json()) as { info?: { spend?: number; max_budget?: number | null } }
		if (typeof info?.spend !== "number") {
			return null
		}
		return { spendDollars: info.spend, maxBudgetDollars: info.max_budget ?? null }
	} catch {
		// a network failure or a timeout reads as an unknown budget
		return null
	}
}

/**
 * Reads a key's recorded spend in dollars, or null if the proxy is unreachable, times out, or does not know the key.
 */
export async function readLiteLLMKeySpend(key: string): Promise<number | null> {
	// read the key's budget and return its spend
	const litellmKeyBudget = await readLiteLLMKeyBudget(key)
	return litellmKeyBudget?.spendDollars ?? null
}

/**
 * Replaces the user's key with a new key at the user's current budget. Returns false if the replacement failed.
 * Returns true for a user with no key, who has nothing to replace.
 */
export async function replaceUserLiteLLMKey(userId: string): Promise<boolean> {
	// a user whose key was never created has nothing to replace
	const litellmKeyOwner = await loadLiteLLMKeyOwner(userId)
	if (!litellmKeyOwner?.litellmVirtualKey) {
		return true
	}
	const { litellmVirtualKey, budgetCents } = litellmKeyOwner

	// the new key is stored before the old one is retired, so a store that fails leaves the user on the old key
	try {
		const replacementKey = await provisionLiteLLMKey(litellmKeyOwner.email, budgetCents)
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
		await deleteLiteLLMKey(litellmVirtualKey).catch((error: unknown) => {
			console.error(`litellm could not retire the old key for user ${userId}`, error)
			reportError(error, "chat", { userId })
		})
		return true
	} catch (error) {
		// report a failed replacement and return false instead of throwing an error.
		// the old key stays, sized to the old budget
		console.error(`litellm key replace failed for user ${userId}`, error)
		reportError(error, "chat", { userId, budgetCents: String(budgetCents) })
		return false
	}
}

// how many keys the monthly reset replaced, and how many it could not
export type BudgetResetSummary = { replacedCount: number; failedCount: number }

/**
 * Replaces every key created before the current month began, so each user's spend starts the month at zero.
 * One attempt per user. A failure is reported, and the next reset tries that user's key again.
 */
export async function resetMonthlyBudgets(
	replaceLiteLLMKey: (userId: string) => Promise<boolean> = replaceUserLiteLLMKey,
): Promise<BudgetResetSummary> {
	// the users whose key predates the month. a user with no key has nothing to reset
	const dueUsers = await db
		.select({ id: users.id })
		.from(users)
		.where(and(isNotNull(users.litellmVirtualKey), lt(users.litellmKeyCreatedAt, startOfUtcMonth(new Date()))))

	// replace each due user's key. a failed replacement leaves that key due for the next reset
	const replaceLiteLLMKeyResults = await runWithConcurrency(dueUsers, MONTHLY_BUDGET_RESET_CONCURRENCY, (user) =>
		replaceLiteLLMKey(user.id).catch((error: unknown) => {
			// a read that fails before the replacement starts is this user's failure, never the reset's
			console.error(`monthly budget reset could not replace the key for user ${user.id}`, error)
			reportError(error, "billing", { userId: user.id })
			return false
		}),
	)

	// count the replaced keys and the failed replacements
	const replacedKeysCount = replaceLiteLLMKeyResults.filter(Boolean).length
	return { replacedCount: replacedKeysCount, failedCount: dueUsers.length - replacedKeysCount }
}

// load a user's stored key, and the email and budget that a new key is created with.
// return undefined if the user is gone
async function loadLiteLLMKeyOwner(userId: string): Promise<LiteLLMKeyOwner | undefined> {
	// load the user's row, and return undefined if the user is gone
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
	if (!user) {
		return undefined
	}

	// the budget that a new key is sized to
	const budgetCents = userBudgetCents({
		isAdmin: isAdminRole(user.role),
		plan: user.plan,
		budgetOverrideCents: user.budgetOverrideCents,
	})
	return { email: user.email, litellmVirtualKey: user.litellmVirtualKey, budgetCents }
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
