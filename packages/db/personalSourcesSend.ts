// a multi-Topic send shares one transaction, retry identity, and accepted-send charge
import { PERSONAL_SOURCES_SEND_TOPIC_LIMIT, type PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import { toAuthSecretSignature } from "@carlnotes/server/hmac"
import { type DbTransaction, db } from "./index"
import { type ReceivePersonalSourceEntryOptions, receivePersonalSourceEntry } from "./personalSourcesReceive"

// a refused destination rolls back every entry and the one daily charge
class PersonalSourcesSendRefused extends Error {
	constructor(readonly outcome: Exclude<PersonalSourcesSendResult, { status: "accepted" }>) {
		super("Personal sources send refused")
	}
}

/**
 * Stores one send or email in every selected Topic atomically and consumes one allowance for its origin.
 */
export async function receivePersonalSourcesSend(
	{
		topicIds,
		origin = "send",
		...delivery
	}: Omit<ReceivePersonalSourceEntryOptions, "topicId" | "origin" | "sendBatch" | "existingSourceId"> & {
		topicIds: string[]
		origin?: "send" | "email"
	},
	transaction?: DbTransaction,
): Promise<PersonalSourcesSendResult> {
	// sort the complete destination set for stable retry digests and Topic lock ordering
	const sortedTopicIds = [...new Set(topicIds)].sort()
	if (
		!sortedTopicIds.length ||
		(origin === "send" && sortedTopicIds.length > PERSONAL_SOURCES_SEND_TOPIC_LIMIT) ||
		sortedTopicIds.length !== topicIds.length
	) {
		return { status: "not_found" }
	}
	try {
		// a nested savepoint rolls back every destination while the enclosing email transaction can record a refusal
		return await (transaction ?? db).transaction(async (transaction) => {
			const confirmations: Extract<PersonalSourcesSendResult, { status: "accepted" }>[] = []
			for (const [index, topicId] of sortedTopicIds.entries()) {
				// the first confirmation binds the request id to the complete batch. later confirmations share its charge
				const requestId =
					index === 0
						? delivery.requestId
						: toAuthSecretSignature({
								value: JSON.stringify([delivery.requestId, topicId]),
								purpose: "personal sources send batch",
								encoding: "hex",
							})
				const confirmation = await receivePersonalSourceEntry(
					{
						...delivery,
						topicId,
						requestId,
						origin,
						sendBatch: { topicIds: sortedTopicIds, isFirstTopic: index === 0 },
					},
					transaction,
				)
				if (confirmation.status !== "accepted") {
					throw new PersonalSourcesSendRefused(confirmation)
				}
				confirmations.push(confirmation)
			}
			// the result is the first confirmation with every Topic's confirmation
			const firstConfirmation = confirmations[0]
			if (!firstConfirmation) {
				throw new Error("An accepted send requires a confirmation")
			}
			return {
				...firstConfirmation,
				confirmations: confirmations.map(({ topic, entryId, queuedLinkCount }) => ({
					topic,
					entryId,
					queuedLinkCount,
				})),
			}
		})
	} catch (error) {
		if (error instanceof PersonalSourcesSendRefused) {
			return error.outcome
		}
		throw error
	}
}
