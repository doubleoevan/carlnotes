// both external transports converge on one authenticated, accepted-only send path
import type { AiAgentSourceConfig, PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import {
	type PersonalSourcesSendPayload,
	personalSourcesSendPayload,
} from "@carlnotes/contracts/personalSourcesPayloads"
import type { DbTransaction } from "@carlnotes/db"
import { authenticateAiAgentApiKey } from "@carlnotes/db/aiAgentApiKeys"
import { loadLiveAiAgent } from "@carlnotes/db/aiAgentConnections"
import { receivePersonalSourceEntry } from "@carlnotes/db/personalSourcesReceive"
import { receivePersonalSourcesSend } from "@carlnotes/db/personalSourcesSend"
import { aiAgentApiKeys } from "@carlnotes/db/schema/personalSources"
import { personalSourcesReceivingFailure } from "@carlnotes/server/personalSourcesSettings"
import { eq } from "drizzle-orm"
import { notifyPersonalSourcesChanged } from "./work"

// these identities come from verified transport authority, never from the send payload
export type PersonalSourcesSender =
	| { kind: "oauth"; userId: string; clientId: string }
	| { kind: "api_key"; secret: string }
type ResolvedSender = {
	userId: string
	identity: string
	label: string
	config: AiAgentSourceConfig
	authorize: (transaction: DbTransaction) => Promise<boolean>
}

/**
 * Validates an explicit send, then checks identity, allowance, and Topic edit authority.
 */
export async function sendToPersonalSources({
	sender,
	payload,
	routeTopicId = null,
}: {
	sender: PersonalSourcesSender
	payload: PersonalSourcesSendPayload
	routeTopicId?: string | null
}): Promise<PersonalSourcesSendResult> {
	const input = personalSourcesSendPayload.parse(payload)
	const topicIds = input.topic_ids ?? (input.topic_id ? [input.topic_id] : [])
	if (routeTopicId && topicIds.some((topicId) => topicId !== routeTopicId)) {
		return { status: "not_found" }
	}
	const identity = await resolvePersonalSourcesSender(sender)
	if (!identity) {
		return { status: "disconnected" }
	}
	const receivingFailure = personalSourcesReceivingFailure()
	if (receivingFailure) {
		return { status: "unavailable", reason: receivingFailure }
	}
	const delivery = {
		userId: identity.userId,
		senderIdentity: identity.identity,
		requestId: input.request_id ?? crypto.randomUUID(),
		config: identity.config,
		authorizeSender: identity.authorize,
		payload: {
			title: input.title,
			text: input.summary,
			sender: identity.label,
			senderKind: "agent" as const,
			links: input.links,
			chatUrl: input.chat_url ?? null,
		},
	}
	const receipt = input.topic_id
		? await receivePersonalSourceEntry({ ...delivery, topicId: input.topic_id, origin: "send" })
		: await receivePersonalSourcesSend({ ...delivery, topicIds })
	if (receipt.status === "accepted") {
		for (const savedReceipt of receipt.receipts ?? [receipt]) {
			await notifyPersonalSourcesChanged(savedReceipt.topic.id)
		}
	}
	return receipt
}

// the acceptance transaction rechecks the live identity under its per-user revocation lock
async function resolvePersonalSourcesSender(sender: PersonalSourcesSender): Promise<ResolvedSender | null> {
	if (sender.kind === "oauth") {
		const aiAgent = await loadLiveAiAgent({ userId: sender.userId, clientId: sender.clientId })
		return aiAgent
			? {
					userId: sender.userId,
					identity: `oauth:${sender.clientId}`,
					label: aiAgent.label,
					config: { delivery: "oauth", clientId: sender.clientId, appDomain: aiAgent.domain },
					authorize: async (transaction) =>
						Boolean(await loadLiveAiAgent({ userId: sender.userId, clientId: sender.clientId, transaction })),
				}
			: null
	}
	const key = await authenticateAiAgentApiKey(sender.secret)
	return key
		? {
				userId: key.userId,
				identity: `api_key:${key.keyId}`,
				label: key.label,
				config: { delivery: "api_key", apiKeyId: key.keyId },
				authorize: async (transaction) => {
					const liveKey = await authenticateAiAgentApiKey(sender.secret, transaction)
					if (!liveKey || liveKey.userId !== key.userId) {
						return false
					}
					await transaction
						.update(aiAgentApiKeys)
						.set({ lastUsedAt: new Date() })
						.where(eq(aiAgentApiKeys.id, key.keyId))
					return true
				},
			}
		: null
}
