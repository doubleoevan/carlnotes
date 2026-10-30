// deliver push notifications through the Expo push service: one push per phone in the service's chunks, each
// accepted push recorded with its event, recipient, and phone as its chunk returns, so a retry sends only to the
// phones that are not recorded yet

import { MOBILE_APP_EXPO_PROJECT_NAME } from "@carlnotes/contracts/mobileApp"
import { withoutPushTokens } from "@carlnotes/contracts/monitoringRedaction"
import {
	PUSH_CHANNEL_IDS,
	type PushNotificationData,
	type PushNotificationKind,
} from "@carlnotes/contracts/pushDevices"
import { db } from "@carlnotes/db"
import { pushDevices, pushNotificationSends } from "@carlnotes/db/schema/pushDevices"
import { sessions } from "@carlnotes/db/schema/users"
import {
	chunkPushMessages,
	type ExpoPushMessage,
	type ExpoPushTicket,
	isRetryablePushServiceError,
	sendPushMessageChunk,
} from "@carlnotes/server/expoPush"
import { and, eq, gt, inArray, type SQL } from "drizzle-orm"

// how a push send ended: sent to every phone it could reach, skipped with no one to reach, or failed, retryable if
// another attempt can help and rejected if it cannot
export type PushOutcome =
	| { outcome: "sent"; acceptedCount: number }
	| { outcome: "skipped" }
	| { outcome: "retryable"; pushError: string }
	| { outcome: "rejected"; pushError: string }

// what a push is about: a Scan's new Findings, or a room message's chat mentions
export type PushEvent = { kind: "topic-scan"; scanId: string } | { kind: "chat-mention"; chatMessageId: number }

// what a long send reports between chunks: that it is still alive, and whether it was cancelled and must stop
export type PushProgress = { onChunkSent: () => void; isCancelled: () => boolean }

// a send with no one watching it
export const UNWATCHED_PUSH_PROGRESS: PushProgress = { onChunkSent: () => {}, isCancelled: () => false }

// the push service's error for a request whose tokens belong to more than one Expo project
const TOO_MANY_PROJECTS_ERROR_CODE = "PUSH_TOO_MANY_EXPERIENCE_IDS"

// one phone to push to, with the account it belongs to and what the push says and opens
export type PushTarget = {
	recipientUserId: string
	pushDeviceId: string
	expoPushToken: string
	title: string
	body: string
	url: string
}

// the ticket errors that waiting can fix, and the one that retires the phone. any other error is final
const RETRYABLE_TICKET_ERROR_CODES = new Set(["MessageRateExceeded", "ExpoError", "ProviderError"])
export const DEVICE_NOT_REGISTERED_ERROR_CODE = "DeviceNotRegistered"

/**
 * Returns a push event's id as a report names it: the Scan's id, or the room message's.
 */
export function toPushEventId(pushEvent: PushEvent): string {
	return pushEvent.kind === "topic-scan" ? pushEvent.scanId : String(pushEvent.chatMessageId)
}

/**
 * Returns the filter on push sends that names one event's rows.
 */
export function toPushEventFilter(pushEvent: PushEvent): SQL {
	return pushEvent.kind === "topic-scan"
		? eq(pushNotificationSends.scanId, pushEvent.scanId)
		: eq(pushNotificationSends.roomMessageId, pushEvent.chatMessageId)
}

/**
 * Sends one push per phone that the event has not reached yet, in the service's chunks, recording each chunk's
 * accepted pushes as soon as it returns. A chunk the service rejects as final is kept as an error and the next chunks
 * still go. A retryable rejection ends the send.
 */
export async function deliverPushes(
	pushEvent: PushEvent,
	pushTargets: PushTarget[],
	pushProgress: PushProgress,
): Promise<PushOutcome> {
	// leave out every phone that an earlier attempt already reached
	const recordedPushPairKeys = await loadRecordedPushPairs(pushEvent)
	const unsentPushTargets = pushTargets.filter(
		(pushTarget) => !recordedPushPairKeys.has(toPushPairKey(pushTarget.recipientUserId, pushTarget.pushDeviceId)),
	)
	if (unsentPushTargets.length === 0) {
		return { outcome: "skipped" }
	}

	// one message per phone, in the targets' order, so each ticket maps back to its phone
	const pushMessages = unsentPushTargets.map((pushTarget) => toPushMessage(pushEvent.kind, pushTarget))
	const pushDeliveryTally: PushChunkTally = { acceptedCount: 0, retryableError: null, rejectedError: null }
	let messageIndex = 0
	for (const pushMessageChunk of chunkPushMessages(pushMessages)) {
		// a cancelled attempt stops between chunks
		if (pushProgress.isCancelled()) {
			return { outcome: "retryable", pushError: "cancelled" }
		}

		// the chunk's own targets, in the same order as its messages
		const plannedPushTargets = unsentPushTargets.slice(messageIndex, messageIndex + pushMessageChunk.length)
		messageIndex += pushMessageChunk.length

		// keep only the phones still bound to their recipient's live session, so a phone that moved to another account
		// since the plan gets nothing of the earlier account's
		const boundPushDeviceIds = await loadBoundPushDeviceIds(plannedPushTargets)
		const chunkPushTargets = plannedPushTargets.filter((pushTarget) => boundPushDeviceIds.has(pushTarget.pushDeviceId))
		const boundPushMessages = pushMessageChunk.filter((_, index) =>
			boundPushDeviceIds.has(plannedPushTargets[index]?.pushDeviceId ?? ""),
		)
		if (chunkPushTargets.length === 0) {
			continue
		}

		// a rate limit, a server error, or no response ends the send for its retry, after the earlier chunks were recorded
		const pushChunkTally = await sendPushChunk(pushEvent, chunkPushTargets, boundPushMessages)
		if (pushChunkTally.isRequestFailed && pushChunkTally.retryableError) {
			return { outcome: "retryable", pushError: pushChunkTally.retryableError }
		}

		// keep the count and the first error of each kind, and report the chunk as done
		pushDeliveryTally.acceptedCount += pushChunkTally.acceptedCount
		pushDeliveryTally.retryableError ??= pushChunkTally.retryableError
		pushDeliveryTally.rejectedError ??= pushChunkTally.rejectedError
		pushProgress.onChunkSent()
	}

	// return a retryable error first, then a final one, then the sent count
	if (pushDeliveryTally.retryableError) {
		return { outcome: "retryable", pushError: pushDeliveryTally.retryableError }
	}
	return pushDeliveryTally.rejectedError
		? { outcome: "rejected", pushError: pushDeliveryTally.rejectedError }
		: { outcome: "sent", acceptedCount: pushDeliveryTally.acceptedCount }
}

// one chunk's send: its settled tickets, or the error of a request the service did not take
type PushChunkSendResult = PushChunkTally & { isRequestFailed: boolean }

// send one chunk. a chunk the service rejects for mixing projects is sent again without the other projects' tokens,
// whose phones are retired
async function sendPushChunk(
	pushEvent: PushEvent,
	chunkPushTargets: PushTarget[],
	pushMessageChunk: ExpoPushMessage[],
): Promise<PushChunkSendResult> {
	try {
		const pushTickets = await sendPushMessageChunk(pushMessageChunk)
		return { ...(await settlePushTickets(pushEvent, chunkPushTargets, pushTickets)), isRequestFailed: false }
	} catch (error) {
		// the other projects' tokens, which the service names in its error
		const foreignExpoPushTokens = toForeignProjectPushTokens(error)
		if (foreignExpoPushTokens.size > 0) {
			await db.delete(pushDevices).where(inArray(pushDevices.expoPushToken, [...foreignExpoPushTokens]))

			// the chunk again with the app's own tokens alone
			const ownPushTargets = chunkPushTargets.filter(
				(pushTarget) => !foreignExpoPushTokens.has(pushTarget.expoPushToken),
			)
			const ownPushMessages = pushMessageChunk.filter(
				(pushMessage) => !foreignExpoPushTokens.has(String(pushMessage.to)),
			)
			return ownPushTargets.length > 0
				? sendPushChunk(pushEvent, ownPushTargets, ownPushMessages)
				: { acceptedCount: 0, retryableError: null, rejectedError: null, isRequestFailed: false }
		}

		// any other failed request is retryable if waiting can fix it, and final otherwise
		const pushError = withoutPushTokens(error instanceof Error ? error.message : String(error))
		return isRetryablePushServiceError(error)
			? { acceptedCount: 0, retryableError: pushError, rejectedError: null, isRequestFailed: true }
			: { acceptedCount: 0, retryableError: null, rejectedError: pushError, isRequestFailed: true }
	}
}

// the tokens of every Expo project other than the app's, from an error that rejected a chunk for mixing projects
function toForeignProjectPushTokens(error: unknown): Set<string> {
	// only the mixed-projects error names tokens by project
	const { code, details } = (error ?? {}) as { code?: unknown; details?: unknown }
	if (code !== TOO_MANY_PROJECTS_ERROR_CODE || typeof details !== "object" || details === null) {
		return new Set()
	}

	// every token listed under a project that is not the app's
	const projectTokenLists = Object.entries(details as Record<string, unknown>)
		.filter(([projectName]) => projectName !== MOBILE_APP_EXPO_PROJECT_NAME)
		.map(([, projectTokens]) => (Array.isArray(projectTokens) ? projectTokens.map(String) : []))
	return new Set(projectTokenLists.flat())
}

// one chunk's tickets as they settle: how many were accepted, and the first retryable and final error codes
type PushChunkTally = { acceptedCount: number; retryableError: string | null; rejectedError: string | null }

// record each accepted ticket, delete each phone the service says is not registered, and classify the other errors
async function settlePushTickets(
	pushEvent: PushEvent,
	chunkPushTargets: PushTarget[],
	pushTickets: ExpoPushTicket[],
): Promise<PushChunkTally> {
	// sort each ticket by its status and error
	const acceptedSends: { pushTarget: PushTarget; ticketId: string }[] = []
	const unregisteredPushDeviceIds: string[] = []
	const pushChunkTally: PushChunkTally = { acceptedCount: 0, retryableError: null, rejectedError: null }
	for (const [ticketIndex, pushTicket] of pushTickets.entries()) {
		// the ticket's own phone, and an accepted ticket to record
		const pushTarget = chunkPushTargets[ticketIndex]
		if (!pushTarget) {
			continue
		}
		if (pushTicket.status === "ok") {
			acceptedSends.push({ pushTarget, ticketId: pushTicket.id })
			continue
		}

		// an unregistered phone is retired
		const ticketError = pushTicket.details?.error ?? "unknown"
		if (ticketError === DEVICE_NOT_REGISTERED_ERROR_CODE) {
			unregisteredPushDeviceIds.push(pushTarget.pushDeviceId)
			continue
		}

		// the first error that waiting can fix is kept, and the first final one
		if (RETRYABLE_TICKET_ERROR_CODES.has(ticketError)) {
			pushChunkTally.retryableError ??= ticketError
		} else {
			pushChunkTally.rejectedError ??= ticketError
		}
	}

	// write the chunk's records and retirements before the next chunk goes out
	await recordPushSends(pushEvent, acceptedSends)
	if (unregisteredPushDeviceIds.length > 0) {
		await db.delete(pushDevices).where(inArray(pushDevices.id, unregisteredPushDeviceIds))
	}
	pushChunkTally.acceptedCount = acceptedSends.length
	return pushChunkTally
}

// the message for one phone: its title and body, the Android channel of its kind, and the data the app opens
function toPushMessage(kind: PushNotificationKind, pushTarget: PushTarget): ExpoPushMessage {
	const data: PushNotificationData = { kind, url: pushTarget.url, recipientUserId: pushTarget.recipientUserId }
	return {
		to: pushTarget.expoPushToken,
		title: pushTarget.title,
		body: pushTarget.body,
		data,
		sound: "default",
		channelId: PUSH_CHANNEL_IDS[kind],
	}
}

// the recipient and phone pairs that the event already reached
async function loadRecordedPushPairs(pushEvent: PushEvent): Promise<Set<string>> {
	const recordedRows = await db
		.select({
			recipientUserId: pushNotificationSends.recipientUserId,
			pushDeviceId: pushNotificationSends.pushDeviceId,
		})
		.from(pushNotificationSends)
		.where(toPushEventFilter(pushEvent))
	return new Set(
		recordedRows.map((recordedRow) => toPushPairKey(recordedRow.recipientUserId, recordedRow.pushDeviceId)),
	)
}

// the ids of the planned phones that are still bound, with the same token and recipient, to a session that has not
// ended
async function loadBoundPushDeviceIds(plannedPushTargets: PushTarget[]): Promise<Set<string>> {
	// the planned phones as they are bound now, each to a live session
	const plannedPushDeviceIds = plannedPushTargets.map((pushTarget) => pushTarget.pushDeviceId)
	const boundRows = await db
		.select({
			id: pushDevices.id,
			expoPushToken: pushDevices.expoPushToken,
			userId: pushDevices.userId,
		})
		.from(pushDevices)
		.innerJoin(sessions, eq(pushDevices.sessionId, sessions.id))
		.where(and(inArray(pushDevices.id, plannedPushDeviceIds), gt(sessions.expiresAt, new Date())))

	// a phone counts only if its token and its account are still the ones planned
	const plannedTargetsById = new Map(plannedPushTargets.map((pushTarget) => [pushTarget.pushDeviceId, pushTarget]))
	const isStillPlanned = (boundRow: (typeof boundRows)[number]): boolean => {
		const plannedTarget = plannedTargetsById.get(boundRow.id)
		return plannedTarget?.expoPushToken === boundRow.expoPushToken && plannedTarget.recipientUserId === boundRow.userId
	}

	// the ids of the phones that passed
	return new Set(boundRows.filter(isStillPlanned).map((boundRow) => boundRow.id))
}

// one recipient and phone pair as a set key
function toPushPairKey(recipientUserId: string, pushDeviceId: string | null): string {
	return `${recipientUserId}:${pushDeviceId}`
}

// record the accepted pushes of one chunk, once per event, recipient, and phone however many times it is retried
async function recordPushSends(
	pushEvent: PushEvent,
	acceptedSends: { pushTarget: PushTarget; ticketId: string }[],
): Promise<void> {
	if (acceptedSends.length === 0) {
		return
	}

	// the event's own column, and the other kind's left null
	const eventColumns =
		pushEvent.kind === "topic-scan" ? { scanId: pushEvent.scanId } : { roomMessageId: pushEvent.chatMessageId }
	await db
		.insert(pushNotificationSends)
		.values(
			acceptedSends.map(({ pushTarget, ticketId }) => ({
				kind: pushEvent.kind,
				...eventColumns,
				recipientUserId: pushTarget.recipientUserId,
				pushDeviceId: pushTarget.pushDeviceId,
				ticketId,
			})),
		)
		.onConflictDoNothing()
}
