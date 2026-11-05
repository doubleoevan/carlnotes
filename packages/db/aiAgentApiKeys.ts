// one-time bearer credentials for deliberate sends, with digest-only storage and owner cleanup
import { randomBytes } from "node:crypto"
import { AI_AGENT_API_KEY_LIMIT } from "@carlnotes/contracts/personalSources"
import type { AiAgentApiKey } from "@carlnotes/contracts/personalSourcesAccounts"
import { isSameSignature } from "@carlnotes/server/hmac"
import { and, count, desc, eq, isNull } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { decidePersonalSourcesCapability } from "./personalSourcesAuthority"
import { aiAgentApiKeys } from "./schema/personalSources"
import { users } from "./schema/users"

// public ids are fixed-width hex, so underscores cannot create ambiguous credential boundaries
const AI_AGENT_API_KEY_PATTERN = /^cnk_v1_([a-f0-9]{32})_([A-Za-z0-9_-]{43})$/
const keyMetadataColumns = {
	id: aiAgentApiKeys.id,
	label: aiAgentApiKeys.label,
	lastFour: aiAgentApiKeys.lastFour,
	createdAt: aiAgentApiKeys.createdAt,
	lastUsedAt: aiAgentApiKeys.lastUsedAt,
	revokedAt: aiAgentApiKeys.revokedAt,
}

/**
 * Creates a bounded Premium credential and returns its bearer value exactly once.
 */
export async function createAiAgentApiKey({
	userId,
	label,
}: {
	userId: string
	label: string
}): Promise<{ key: AiAgentApiKey; secret: string } | "forbidden" | "limit"> {
	return db.transaction(async (transaction) => {
		// serialize creation and revocation with sends and the active credential cap
		await transaction.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update")
		if (!(await decidePersonalSourcesCapability({ userId, capability: "personalSources:apiKey", transaction }))) {
			return "forbidden"
		}
		const [activeKeyCount] = await transaction
			.select({ count: count() })
			.from(aiAgentApiKeys)
			.where(and(eq(aiAgentApiKeys.userId, userId), isNull(aiAgentApiKeys.revokedAt)))
		if ((activeKeyCount?.count ?? 0) >= AI_AGENT_API_KEY_LIMIT) {
			return "limit"
		}

		// persist the digest and display suffix, never the returned bearer value
		const id = randomBytes(16).toString("hex")
		const secret = `cnk_v1_${id}_${randomBytes(32).toString("base64url")}`
		const [key] = await transaction
			.insert(aiAgentApiKeys)
			.values({ id, userId, label, secretDigest: digestAiAgentApiKey(secret), lastFour: secret.slice(-4) })
			.returning(keyMetadataColumns)
		if (!key) {
			throw new Error("AI Agent API key insertion returned no id")
		}
		return { key: toAiAgentApiKeyMetadata(key), secret }
	})
}

/**
 * Lists the owner's display metadata without retrieving credential digests.
 */
export async function listAiAgentApiKeys(userId: string): Promise<AiAgentApiKey[]> {
	const keys = await db
		.select(keyMetadataColumns)
		.from(aiAgentApiKeys)
		.where(eq(aiAgentApiKeys.userId, userId))
		.orderBy(desc(aiAgentApiKeys.createdAt))
	return keys.map(toAiAgentApiKeyMetadata)
}

/**
 * Revokes one owned credential, including after downgrade, without affecting other users.
 */
export async function revokeAiAgentApiKey({ userId, keyId }: { userId: string; keyId: string }): Promise<void> {
	await db.transaction(async (transaction) => {
		await transaction.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update")
		await transaction
			.update(aiAgentApiKeys)
			.set({ revokedAt: new Date() })
			.where(and(eq(aiAgentApiKeys.id, keyId), eq(aiAgentApiKeys.userId, userId), isNull(aiAgentApiKeys.revokedAt)))
	})
}

/**
 * Verifies a send credential and its current entitlement, returning only its authenticated identity.
 */
export async function authenticateAiAgentApiKey(
	secret: string,
	transaction: DbHandle = db,
): Promise<{ userId: string; keyId: string; label: string } | null> {
	const keyId = AI_AGENT_API_KEY_PATTERN.exec(secret)?.[1]
	if (!keyId) {
		return null
	}
	const [key] = await transaction
		.select()
		.from(aiAgentApiKeys)
		.where(and(eq(aiAgentApiKeys.id, keyId), isNull(aiAgentApiKeys.revokedAt)))
		.limit(1)
	if (!key || !isSameSignature({ expectedSignature: key.secretDigest, signature: digestAiAgentApiKey(secret) })) {
		return null
	}
	if (
		!(await decidePersonalSourcesCapability({ userId: key.userId, capability: "personalSources:apiKey", transaction }))
	) {
		return null
	}
	return { userId: key.userId, keyId: key.id, label: key.label }
}

// random 256-bit secrets need a one-way lookup digest rather than password stretching
function digestAiAgentApiKey(secret: string): string {
	return new Bun.CryptoHasher("sha256").update(secret).digest("hex")
}

// dates are serialized at the response boundary
function toAiAgentApiKeyMetadata(
	key: Pick<typeof aiAgentApiKeys.$inferSelect, "id" | "label" | "lastFour" | "createdAt" | "lastUsedAt" | "revokedAt">,
): AiAgentApiKey {
	return {
		...key,
		createdAt: key.createdAt.toISOString(),
		lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
		revokedAt: key.revokedAt?.toISOString() ?? null,
	}
}
