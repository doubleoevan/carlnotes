// both external transports converge on one authenticated, accepted-only send path
import type { AnalyticsEventProperties } from "@carlnotes/contracts/analyticsEvents"
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
import { trackEvent } from "@carlnotes/server/analytics"
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
	analyticsProperties,
}: {
	sender: PersonalSourcesSender
	payload: PersonalSourcesSendPayload
	routeTopicId?: string | null
	analyticsProperties: AnalyticsEventProperties
}): Promise<PersonalSourcesSendResult> {
	// a route's Topic limits which Topics the send may name
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
	const confirmation = input.topic_id
		? await receivePersonalSourceEntry({ ...delivery, topicId: input.topic_id, origin: "send" })
		: await receivePersonalSourcesSend({ ...delivery, topicIds })

	// report the send, and notify each Topic that saved it
	trackPersonalSourcesSend({ userId: identity.userId, confirmation, analyticsProperties })
	if (confirmation.status === "accepted") {
		for (const savedConfirmation of confirmation.confirmations ?? [confirmation]) {
			await notifyPersonalSourcesChanged(savedConfirmation.topic.id)
		}
	}
	return confirmation
}

// report an accepted send by its counts, or the reason the send was not saved
function trackPersonalSourcesSend({
	userId,
	confirmation,
	analyticsProperties,
}: {
	userId: string
	confirmation: PersonalSourcesSendResult
	analyticsProperties: AnalyticsEventProperties
}): void {
	const sendAnalyticsProperties = { ...analyticsProperties, origin: "send" }

	// an accepted send reports its entries and queued links
	if (confirmation.status === "accepted") {
		const savedConfirmations = confirmation.confirmations ?? [confirmation]
		trackEvent("personal_source_entry_received", userId, {
			...sendAnalyticsProperties,
			...(savedConfirmations.length === 1 && { topicId: confirmation.topic.id }),
			entryCount: savedConfirmations.length,
			queuedLinkCount: savedConfirmations.reduce((linkCount, { queuedLinkCount }) => linkCount + queuedLinkCount, 0),
		})
		return
	}

	// any other send reports why it stopped
	if (confirmation.status === "quota") {
		trackEvent("personal_sources_quota_reached", userId, sendAnalyticsProperties)
		return
	}
	trackEvent("personal_sources_send_rejected", userId, { ...sendAnalyticsProperties, reason: confirmation.status })
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
