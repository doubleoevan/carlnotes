// the Expo push service: sending push messages in the service's chunks and reading their receipts. the client
// authenticates with EXPO_PUSH_ACCESS_TOKEN, named apart from EXPO_ACCESS_TOKEN, which the EAS CLI reads as its login
import { Expo, type ExpoPushMessage, type ExpoPushReceipt, type ExpoPushTicket } from "expo-server-sdk"

export type { ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket }

// a client, authenticated if the environment has an access token. the SDK retries a rate-limited request itself
function toExpoClient(): Expo {
	return new Expo({ accessToken: Bun.env.EXPO_PUSH_ACCESS_TOKEN?.trim() || undefined })
}

/**
 * Returns the messages in chunks of at most the 100 a send request accepts.
 */
export function chunkPushMessages(pushMessages: ExpoPushMessage[]): ExpoPushMessage[][] {
	return toExpoClient().chunkPushNotifications(pushMessages)
}

/**
 * Sends one chunk and returns a ticket for each message, in the messages' order. A request the service rejects whole
 * throws an error whose statusCode is the http status, and a request that never reached the service has none.
 */
export function sendPushMessageChunk(pushMessageChunk: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
	return toExpoClient().sendPushNotificationsAsync(pushMessageChunk)
}

/**
 * Returns the receipts of the tickets the service still has, read in chunks of at most the 300 it accepts at once.
 * A ticket with no receipt yet, or one older than the service's 24 hours, has no entry.
 */
export async function readPushReceipts(ticketIds: string[]): Promise<Map<string, ExpoPushReceipt>> {
	// read each chunk in turn, so that a large read stays inside the service's rate limit
	const expoClient = toExpoClient()
	const pushReceipts = new Map<string, ExpoPushReceipt>()
	for (const ticketIdChunk of expoClient.chunkPushNotificationReceiptIds(ticketIds)) {
		const receiptsById = await expoClient.getPushNotificationReceiptsAsync(ticketIdChunk)
		for (const [ticketId, pushReceipt] of Object.entries(receiptsById)) {
			pushReceipts.set(ticketId, pushReceipt)
		}
	}

	// every chunk's receipts, by ticket id
	return pushReceipts
}

/**
 * Returns whether a failed request may succeed if it is sent again: a rate limit, a server error, or no response at all.
 */
export function isRetryablePushServiceError(error: unknown): boolean {
	const statusCode = (error as { statusCode?: unknown } | null)?.statusCode
	return typeof statusCode !== "number" || statusCode === 429 || statusCode >= 500
}
