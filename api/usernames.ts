// the database half of usernames: which username proposals are free and what username a new user is assigned
import { zValidator } from "@hono/zod-validator"
import { usernamePayload } from "@shared/contracts"
import {
	RESERVED_USERNAMES,
	toNormalizedUsername,
	toProposedUsernames,
	toUsernameRejection,
	toUsernameWithDigits,
	type UsernameRejection,
} from "@shared/usernames"
import { eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { users } from "../db/schema"
import { type AppEnv, currentUser } from "./currentUser"

// how many proposals a username batch offers. enough for a real choice, small enough to stay a cheap query
const USERNAME_BATCH_SIZE = 5

// how many username batches are checked before appending digits is considered
const USERNAME_ROUNDS = 3

/**
 * The proposals from a username batch that nobody holds.
 * Comparison is on the normalized form, matching the unique index the database enforces.
 */
export async function toFreeUsernames(proposals: string[]): Promise<string[]> {
	// one query for the whole batch instead of one per proposal
	const normalizedProposals = proposals.map(toNormalizedUsername)
	const matchingRows = await db
		.select({ normalized: users.usernameNormalized })
		.from(users)
		.where(inArray(users.usernameNormalized, normalizedProposals))

	// a held name blocks its proposal, and so does a reserved one
	const blocked = new Set(matchingRows.map((usernameRow) => usernameRow.normalized))
	return proposals.filter((proposal) => {
		const normalized = toNormalizedUsername(proposal)
		return !blocked.has(normalized) && !RESERVED_USERNAMES.has(normalized)
	})
}

/**
 * A batch of username proposals to offer a user. Word pairs are sampled across several rounds first,
 * and digits are only appended when those rounds come back fully taken.
 */
export async function suggestUsernames(): Promise<string[]> {
	// several rounds of word pair usernames to check
	for (let round = 0; round < USERNAME_ROUNDS; round++) {
		const freeUsernames = await toFreeUsernames(toProposedUsernames(USERNAME_BATCH_SIZE))
		if (freeUsernames.length > 0) {
			return freeUsernames
		}
	}
	// the word space is exhausted enough here that a suffix is now required
	return toFreeUsernames(toProposedUsernames(USERNAME_BATCH_SIZE).map(toUsernameWithDigits))
}

/**
 * The username a new user is assigned at signup.
 */
export async function toAssignedUsername(): Promise<string> {
	const [freeUsername] = await suggestUsernames()
	return freeUsername ?? toUsernameWithDigits(toProposedUsernames(1)[0] as string)
}

// why a requested username was rejected in addition to the reasons the validator gives
export type SetUsernameRejection = UsernameRejection | "taken"

/**
 * Set a user's username. The name is display only.
 */
export async function saveUsername(userId: string, username: string): Promise<SetUsernameRejection | null> {
	// validate the username
	const usernameRejection = toUsernameRejection(username)
	if (usernameRejection) {
		return usernameRejection
	}

	// check if the username is taken
	const [freeUsername] = await toFreeUsernames([username])
	if (!freeUsername) {
		return "taken"
	}
	// the database index settles any conflict from here.
	return saveChosenUsername(userId, username)
}

// write a username the user chose. the unique index on the normalized form settles a race
async function saveChosenUsername(userId: string, username: string): Promise<"taken" | null> {
	try {
		await db
			.update(users)
			.set({ username, usernameNormalized: toNormalizedUsername(username) })
			.where(eq(users.id, userId))
		return null
	} catch (error) {
		// only a unique violation means a concurrent write took the name after the check. anything else rethrows
		if (isUniqueViolation(error)) {
			return "taken"
		}
		throw error
	}
}

/**
 * Write a new user's assigned name after signup. Losing a race for it retries with digits
 * and moves the user row to the name that actually stuck.
 */
export async function ensureUsername(userId: string, username: string): Promise<void> {
	if ((await saveChosenUsername(userId, username)) === null) {
		return
	}

	// the name was taken between assignment and here, so a digits variant takes its place
	if ((await saveChosenUsername(userId, toUsernameWithDigits(username))) !== null) {
		console.error(`could not assign a username for user ${userId}`)
	}
}

/**
 * Whether an error is postgres rejecting a duplicate key, checked through the causes a driver wraps it in.
 */
export function isUniqueViolation(error: unknown): boolean {
	for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause) {
		if ((cause as { code?: string }).code === "23505") {
			return true
		}
	}
	return false
}

// the username update route
export const usernamesRoute = new Hono<AppEnv>().post(
	"/usernames",
	zValidator("json", usernamePayload),
	async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// set the username, or say which way it was rejected
		const rejection = await saveUsername(userId, context.req.valid("json").username)
		return rejection ? context.json({ error: rejection }, 409) : context.json({ ok: true })
	},
)
