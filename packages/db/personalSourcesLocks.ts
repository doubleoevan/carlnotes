// serialize received context and the writes that can broaden its topic's access
import { eq } from "drizzle-orm"
import type { DbTransaction } from "./index"
import { hasUnconvertedPersonalSources } from "./personalSourcesAuthority"
import { topics } from "./schema/topics"
import { users } from "./schema/users"

// expected conflicts use content-free messages safe to return through API and MCP adapters
export class PersonalSourcesConversionError extends Error {
	constructor() {
		super("Personal sources are being upgraded. Try again after migration finishes.")
	}
}

/**
 * Serializes a sender's receipts and entitlement changes while allowing Scans to reference the account.
 */
export async function lockPersonalSourcesSender(transaction: DbTransaction, userId: string): Promise<boolean> {
	const [sender] = await transaction
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, userId))
		.for("no key update")
	return sender !== undefined
}

/**
 * Locks the Topic used by receipt, Source reconciliation, and access-changing writes.
 */
export async function lockPersonalSourcesTopic(
	transaction: DbTransaction,
	topicId: string,
): Promise<typeof topics.$inferSelect | undefined> {
	// competing Topic writes must wait, but a Scan may hold a foreign-key reference to this Topic
	const [topic] = await transaction.select().from(topics).where(eq(topics.id, topicId)).for("no key update")
	return topic
}

/**
 * Keeps legacy generated text private until its migration completes.
 */
export async function assertPersonalSourcesConverted(transaction: DbTransaction, topicId: string): Promise<void> {
	if (await hasUnconvertedPersonalSources(topicId, transaction)) {
		throw new PersonalSourcesConversionError()
	}
}
