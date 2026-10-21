// load the LiteLLM key that is billed for a user's model calls, and create the key if the user has none.
// replace a user's key at a budget change, delete it with the user, and run the monthly reset

import { isAdminRole } from "@carlnotes/contracts/enums"
import { toCentsFromDollars, userBudgetCents } from "@carlnotes/contracts/plans"
import { db } from "@carlnotes/db"
import { startOfUtcMonth } from "@carlnotes/db/quotas"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { deleteLiteLLMKey, type LiteLLMKeyBudget, provisionLiteLLMKey, readLiteLLMKeyBudget } from "./litellmProxy"

// how many key replacements the reset runs against the proxy at once
const MONTHLY_BUDGET_RESET_CONCURRENCY = 4

// a user's stored key, the email and budget that a new key for the user is created with,
// and the role, plan, and budget override that the budget is computed from
type LiteLLMKeyOwner = Pick<
	typeof users.$inferSelect,
	"email" | "litellmVirtualKey" | "role" | "plan" | "budgetOverrideCents"
> & { budgetCents: number }

/**
 * Loads a user's own key, created first if the user has none, or the public key for a visitor, which is undefined if
 * it is unset.
 */
export async function loadUserOrPublicLiteLLMKey(userId: string | null): Promise<string | undefined> {
	return userId ? loadOrProvisionUserLiteLLMKey(userId) : Bun.env.LITELLM_PUBLIC_KEY
}

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

	// store the key only if the user still has no key and still has the budget that the key was created at.
	// the creation time keeps the key out of this month's reset
	const updatedUserIds = await db
		.update(users)
		.set({ litellmVirtualKey: provisionedLiteLLMKey, litellmKeyCreatedAt: new Date() })
		.where(
			and(
				eq(users.id, userId),
				isNull(users.litellmVirtualKey),
				eq(users.role, litellmKeyOwner.role),
				eq(users.plan, litellmKeyOwner.plan),
				sql`${users.budgetOverrideCents} is not distinct from ${litellmKeyOwner.budgetOverrideCents}`,
			),
		)
		.returning({ id: users.id })
		.catch((storeError: unknown) => checkFailedLiteLLMKeyStore({ userId, key: provisionedLiteLLMKey, storeError }))
	if (updatedUserIds.length > 0) {
		return provisionedLiteLLMKey
	}

	// another call stored a key first, or the user's budget changed. delete this call's key and load the key again
	await deleteUnstoredLiteLLMKey(userId, provisionedLiteLLMKey)
	return loadOrProvisionUserLiteLLMKey(userId)
}

/**
 * Loads the key billed for model calls about a topic, which is its owner's key, created first if the owner has none.
 * Throws an error if the topic is gone.
 */
export async function loadOrProvisionTopicOwnerLiteLLMKey(topicId: string): Promise<string> {
	// read the topic's owner, throw an error if the topic is gone, and load the owner's key
	const [topic] = await db.select({ ownerId: topics.ownerId }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}
	return loadOrProvisionUserLiteLLMKey(topic.ownerId)
}

// the user, the created key, and the error that the store of that key threw
type CheckFailedLiteLLMKeyStoreOptions = { userId: string; key: string; storeError: unknown }

// check a store that threw an error. the key counts as stored if the user's row has the key.
// otherwise the key is deleted from the proxy and the store's error is thrown
async function checkFailedLiteLLMKeyStore({
	userId,
	key,
	storeError,
}: CheckFailedLiteLLMKeyStoreOptions): Promise<{ id: string }[]> {
	// an update can store the key and still throw an error, so read the user's row again
	const litellmKeyOwner = await loadLiteLLMKeyOwner(userId)
	if (litellmKeyOwner?.litellmVirtualKey === key) {
		return [{ id: userId }]
	}

	// the key was not stored, so delete the key from the proxy and throw the store's error
	await deleteUnstoredLiteLLMKey(userId, key)
	throw storeError
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
	// compare the stored key's recorded spend with its maximum budget.
	// no stored key, a failed read, and a budget with no maximum are never spent
	const litellmKeyBudget = (await loadUserLiteLLMKeyBudget(userId))?.litellmKeyBudget
	return (
		litellmKeyBudget?.maxBudgetDollars != null && litellmKeyBudget.spendDollars >= litellmKeyBudget.maxBudgetDollars
	)
}

/**
 * Whether the user's stored key has a maximum budget other than the user's budget. True if the budget read fails.
 * False if the user has no key.
 */
export async function isUserLiteLLMKeyBudgetStale(userId: string): Promise<boolean> {
	// return false if the user has no stored key
	const userLiteLLMKeyBudget = await loadUserLiteLLMKeyBudget(userId)
	if (!userLiteLLMKeyBudget) {
		return false
	}

	// compare the key's maximum budget with the user's budget in cents. a failed read or a key with no maximum is stale
	const { litellmKeyOwner, litellmKeyBudget } = userLiteLLMKeyBudget
	if (litellmKeyBudget?.maxBudgetDollars == null) {
		return true
	}
	return toCentsFromDollars(litellmKeyBudget.maxBudgetDollars) !== litellmKeyOwner.budgetCents
}

// a user's stored key with its owner, and the key's budget as the proxy reports it, which is null if the read fails
type UserLiteLLMKeyBudget = { litellmKeyOwner: LiteLLMKeyOwner; litellmKeyBudget: LiteLLMKeyBudget | null }

// load the user's stored key and read its budget from the proxy. return null if the user is gone or has no stored key
async function loadUserLiteLLMKeyBudget(userId: string): Promise<UserLiteLLMKeyBudget | null> {
	// return null if the user has no stored key
	const litellmKeyOwner = await loadLiteLLMKeyOwner(userId)
	if (!litellmKeyOwner?.litellmVirtualKey) {
		return null
	}

	// read the stored key's budget
	const litellmKeyBudget = await readLiteLLMKeyBudget(litellmKeyOwner.litellmVirtualKey)
	return { litellmKeyOwner, litellmKeyBudget }
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
 * Replaces the user's key with a new key at the user's current budget. Returns false if the replacement failed.
 * Returns true for a user with no key, who has nothing to replace.
 */
export async function replaceUserLiteLLMKey(userId: string): Promise<boolean> {
	// a user whose key was never created has nothing to replace
	const litellmKeyOwner = await loadLiteLLMKeyOwner(userId)
	if (!litellmKeyOwner?.litellmVirtualKey) {
		return true
	}
	const { litellmVirtualKey, budgetCents, role, plan, budgetOverrideCents } = litellmKeyOwner

	// the new key is stored before the old one is retired, so a store that fails leaves the user on the old key.
	// the store matches the row only while it still has the key, the role, the plan, and the override that sized the
	// new key, so two replacements at once store one key and a budget that changed since the read stores none
	try {
		const replacementKey = await provisionLiteLLMKey(litellmKeyOwner.email, budgetCents)
		const updatedUserIds = await db
			.update(users)
			.set({ litellmVirtualKey: replacementKey, litellmKeyCreatedAt: new Date() })
			.where(
				and(
					eq(users.id, userId),
					eq(users.litellmVirtualKey, litellmVirtualKey),
					eq(users.role, role),
					eq(users.plan, plan),
					sql`${users.budgetOverrideCents} is not distinct from ${budgetOverrideCents}`,
				),
			)
			.returning({ id: users.id })
			.catch((storeError: unknown) => checkFailedLiteLLMKeyStore({ userId, key: replacementKey, storeError }))

		// the user's row is gone, another replacement stored its key first, or the budget changed since the read, so the
		// new key that no row has is deleted, and the stored key counts as replaced only if its budget is current
		if (updatedUserIds.length === 0) {
			await deleteUnstoredLiteLLMKey(userId, replacementKey)
			return !(await isUserLiteLLMKeyBudgetStale(userId))
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

// the signal that stops the reset, and the function that replaces one user's key
export type ResetMonthlyBudgetsOptions = {
	signal?: AbortSignal
	replaceLiteLLMKey?: (userId: string) => Promise<boolean>
}

/**
 * Replaces every key created before the current month began, so each user's spend starts the month at zero.
 * One attempt per user. A failure is reported, and the next reset tries that user's key again.
 * A reset whose signal aborts stops before its next replacement and rejects with the signal's reason.
 */
export async function resetMonthlyBudgets({
	signal,
	replaceLiteLLMKey = replaceUserLiteLLMKey,
}: ResetMonthlyBudgetsOptions = {}): Promise<BudgetResetSummary> {
	// the users whose key predates the month. a user with no key has nothing to reset
	const dueUsers = await db
		.select({ id: users.id })
		.from(users)
		.where(and(isNotNull(users.litellmVirtualKey), lt(users.litellmKeyCreatedAt, startOfUtcMonth(new Date()))))

	// replace each due user's key. a failed replacement leaves that key due for the next reset.
	// a lost claim stops the reset before the next replacement, outside the per-user catch
	const replaceLiteLLMKeyResults = await runWithConcurrency(dueUsers, MONTHLY_BUDGET_RESET_CONCURRENCY, (user) => {
		signal?.throwIfAborted()
		return replaceLiteLLMKey(user.id).catch((error: unknown) => {
			// a read that fails before the replacement starts is this user's failure, never the reset's
			console.error(`monthly budget reset could not replace the key for user ${user.id}`, error)
			reportError(error, "billing", { userId: user.id })
			return false
		})
	})

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
	return { ...user, budgetCents }
}
