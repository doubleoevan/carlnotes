// selected conversations persist atomically with durable batch and content retry identities
import { PERSONAL_SOURCES_IMPORT_LABELS, type PersonalSourcesImportResult } from "@carlnotes/contracts/personalSources"
import { normalizePersonalSourcesConversation } from "@carlnotes/contracts/personalSourcesImportText"
import {
	type PersonalSourcesImportPayload,
	personalSourcesImportPayload,
} from "@carlnotes/contracts/personalSourcesPayloads"
import { toAuthSecretSignature } from "@carlnotes/server/hmac"
import { personalSourcesReceivingFailure } from "@carlnotes/server/personalSourcesSettings"
import { and, eq } from "drizzle-orm"
import { type DbTransaction, db } from "./index"
import { lockPersonalSourcesSender } from "./personalSourcesLocks"
import { receivePersonalSourceEntry } from "./personalSourcesReceive"
import { personalSourcesDeliveries } from "./schema/personalSources"

// a refused conversation rolls back all new entries from the selected batch
class PersonalSourcesImportRefused extends Error {
	constructor(readonly outcome: Exclude<PersonalSourcesImportResult, { status: "accepted" }>) {
		super("Personal sources import refused")
	}
}

/**
 * Accepts an explicit bounded selection without using daily allowance or requiring a connected AI Agent.
 */
export async function importPersonalSourcesConversations({
	userId,
	topicId,
	payload,
}: {
	userId: string
	topicId: string
	payload: PersonalSourcesImportPayload
}): Promise<PersonalSourcesImportResult> {
	// repeat normalization on the server and discard caller-supplied link provenance
	const validatedPayload = personalSourcesImportPayload.parse(payload)
	const normalizedPayload = personalSourcesImportPayload.parse({
		...validatedPayload,
		conversations: validatedPayload.conversations.map(normalizePersonalSourcesConversation),
	})
	const receivingFailure = personalSourcesReceivingFailure()
	if (receivingFailure) {
		return { status: "unavailable", reason: receivingFailure }
	}

	// one transaction commits every selected conversation or none of them
	try {
		return await db.transaction((transaction) =>
			importLockedConversations({ transaction, userId, topicId, payload: normalizedPayload }),
		)
	} catch (error) {
		if (error instanceof PersonalSourcesImportRefused) {
			return error.outcome
		}
		throw error
	}
}

// the account lock makes batch retry checks and concrete Source creation consistent across replicas
async function importLockedConversations({
	transaction,
	userId,
	topicId,
	payload,
}: {
	transaction: DbTransaction
	userId: string
	topicId: string
	payload: PersonalSourcesImportPayload
}): Promise<PersonalSourcesImportResult> {
	if (!(await lockPersonalSourcesSender(transaction, userId))) {
		return { status: "not_found" }
	}
	const batchIdentity = {
		userId,
		topicId,
		senderIdentity: `import-batch:${payload.provider}`,
		requestId: digestImport([topicId, payload.requestId]),
		payloadDigest: digestImport(payload.conversations),
	}
	const [priorBatch] = await transaction
		.select()
		.from(personalSourcesDeliveries)
		.where(
			and(
				eq(personalSourcesDeliveries.userId, userId),
				eq(personalSourcesDeliveries.senderIdentity, batchIdentity.senderIdentity),
				eq(personalSourcesDeliveries.requestId, batchIdentity.requestId),
			),
		)
	if (priorBatch && priorBatch.payloadDigest !== batchIdentity.payloadDigest) {
		return { status: "conflict", reason: "retry_mismatch" }
	}

	// content fingerprints deduplicate the same conversation even when a later selection has another batch id
	const entryIds = new Set<string>()
	const importBatch = {}
	for (const conversation of payload.conversations) {
		const confirmation = await receivePersonalSourceEntry(
			{
				userId,
				topicId,
				senderIdentity: `import:${payload.provider}`,
				origin: "import",
				importBatch,
				requestId: digestImport([topicId, payload.provider, conversation]),
				config: { delivery: "import", provider: payload.provider },
				authorizeSender: async () => true,
				payload: { ...conversation, sender: PERSONAL_SOURCES_IMPORT_LABELS[payload.provider], senderKind: "import" },
				omittedLinkCount: conversation.omittedLinkCount,
			},
			transaction,
		)
		if (confirmation.status !== "accepted") {
			throw new PersonalSourcesImportRefused(
				confirmation.status === "conflict" ? confirmation : { status: "not_found" },
			)
		}
		entryIds.add(confirmation.entryId)
	}

	// the permanent retry record survives entry deletion and contains no transcript or raw fingerprint input
	const firstEntryId = [...entryIds][0]
	if (firstEntryId) {
		await transaction
			.insert(personalSourcesDeliveries)
			.values({ ...batchIdentity, entryId: firstEntryId, queuedLinkCount: 0 })
			.onConflictDoNothing()
	}
	return { status: "accepted", entryIds: [...entryIds] }
}

// fingerprints never reveal low-entropy transcript or conversation ids through an unkeyed hash
function digestImport(content: unknown): string {
	return toAuthSecretSignature({ value: JSON.stringify(content), purpose: "personal sources import", encoding: "hex" })
}
