// send email through Resend's HTTP API. every call first takes the rate limit slot that every process shares
import { reportError } from "@shared/monitoring"
import { z } from "zod"
import { takeRateLimitSlot } from "../db/redis"

// which kind of email is being sent, so a blocked signup reports differently from a missed scan email
export type EmailKind =
	// the account emails, each sent to one address on its own
	| "verification"
	| "password-reset"
	| "email-change"
	| "topic-invite"
	| "team-invite"
	// the reading emails, which a scan sends in batches
	| "topic-scan"
	| "manual-scan"
	| "flag-content"

// one email to send, shared by the single and batch senders
export type EmailMessage = {
	to: string
	subject: string
	emailContent: string
	// the same email message as text, sent with the HTML
	plainTextContent?: string
	emailKind: EmailKind
	headers?: Record<string, string>
}

// a failed Resend call's HTTP status, null without a response, and Resend's error name
export type ResendFailure = { httpStatus: number | null; resendError: string }

// the result of one Resend call for a Scan's email
export type ResendCallResult =
	| { outcome: "accepted" }
	// a rate limit, a busy idempotency key, a 5xx, or a network failure. retryAfterSeconds is Resend's own wait, if it sent one
	| { outcome: "retryable"; failure: ResendFailure; retryAfterSeconds: number | null }
	// any other rejection, a spent quota, or missing configuration
	| { outcome: "rejected"; failure: ResendFailure }

// one Resend call for a Scan's email, with the Scan and one message or a batch of them
export type SendScanEmailCallOptions = { scanId: string; messages: EmailMessage[] }

// the Resend endpoints for one email and for a batch of them
const RESEND_EMAIL_URL = "https://api.resend.com/emails"
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch"

// how many emails Resend accepts in one batch call
export const RESEND_BATCH_LIMIT = 100

// the Resend errors that name a spent quota, which no retry within the hour can fix
const RESEND_QUOTA_ERRORS = new Set(["daily_quota_exceeded", "monthly_quota_exceeded"])

// how long one Resend call may take before it is abandoned as a network failure
const RESEND_TIMEOUT_MS = 20_000

// the one rate limit slot that every Resend call from the api or the worker takes, held for 200 milliseconds per call.
// calls leave five a second, half of Resend's ten, and can reach Resend closer together than they left
const RESEND_SLOT_KEY = "rate-limit:resend-calls"
const RESEND_SLOT_MS = 200

/**
 * Returns whether Resend will take this address. One address that Resend rejects fails a whole batch.
 */
export function isSendableAddress(address: string): boolean {
	return z.email().safeParse(address.trim()).success
}

/**
 * Reports the addresses dropped as unsendable, by count and never by address.
 */
export function reportDroppedAddresses(emailKind: EmailKind, droppedCount: number): void {
	console.error(`skipped ${droppedCount} ${emailKind} emails whose address could not be sent to`)
	reportError(new Error("resend addresses were dropped as unsendable"), "email", {
		emailKind,
		droppedCount: String(droppedCount),
	})
}

/**
 * Sends one email, returning whether Resend accepted it.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
	// log, report, and skip without a key and a verified from-address
	const resendConfig = toResendConfig(message.emailKind)
	if (!resendConfig) {
		return false
	}

	// wait for the rate limit slot, then post the email to Resend
	const recipientDomain = message.to.split("@")[1] ?? "an unknown domain"
	try {
		await waitForResendSlot()
		const response = await fetch(RESEND_EMAIL_URL, {
			method: "POST",
			headers: toResendHeaders(resendConfig.apiKey),
			body: JSON.stringify(toResendEmailBody(message, resendConfig.fromEmail)),
			signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
		})
		if (!response.ok) {
			// a subscriber silently not receiving their scan email is reported.
			const errorBody = await response.text()
			console.error(`resend ${message.emailKind} to ${recipientDomain} failed: ${response.status} ${errorBody}`)
			reportError(new Error(`resend rejected the send with ${response.status}`), "email", {
				status: String(response.status),
				emailKind: message.emailKind,
				recipientDomain,
				resendError: toResendErrorName(errorBody),
			})
			return false
		}

		// log the message id, so a send that never arrives can be traced in resend
		console.log(`resend accepted ${message.emailKind} to ${recipientDomain} as ${await toResendMessageId(response)}`)
		return true
	} catch (error) {
		console.error(`resend ${message.emailKind} to ${recipientDomain} threw`, error)
		reportError(error, "email", { emailKind: message.emailKind, recipientDomain })
		return false
	}
}

/**
 * Send multiple emails through Resend's batch endpoint, up to 100 per call instead of one POST per recipient.
 * Returns one acceptance flag per message, in the message order. A rejected call marks its whole chunk not accepted.
 */
export async function sendEmailBatches(messages: EmailMessage[]): Promise<boolean[]> {
	// nothing to send needs no config check
	if (messages.length === 0) {
		return []
	}

	// log, report, and skip without a key and a verified from-address
	const emailKind = messages[0]?.emailKind ?? "topic-scan"
	const resendConfig = toResendConfig(emailKind)
	if (!resendConfig) {
		return messages.map(() => false)
	}

	// Resend rejects the whole batch if one address fails its validation
	const sendableMessages = messages.filter((message) => isSendableAddress(message.to))
	if (sendableMessages.length < messages.length) {
		reportDroppedAddresses(emailKind, messages.length - sendableMessages.length)
	}

	// send one messages batch at a time within Resend's per-call limit, collecting one flag per message
	const acceptedByMessage = new Map<EmailMessage, boolean>()
	for (let start = 0; start < sendableMessages.length; start += RESEND_BATCH_LIMIT) {
		const messagesBatch = sendableMessages.slice(start, start + RESEND_BATCH_LIMIT)
		// the whole batch shares one outcome, so each of its messages reports what the call returned
		const isMessagesAccepted = await sendEmailBatch(messagesBatch, resendConfig)
		for (const message of messagesBatch) {
			acceptedByMessage.set(message, isMessagesAccepted)
		}
	}
	return messages.map((message) => acceptedByMessage.get(message) ?? false)
}

/**
 * Sends one Resend call for a Scan's email, one message or a batch, under an idempotency key made of the email kind,
 * the Scan, and a hash of the request body. Returns whether Resend accepted the call, and for a failure whether another
 * attempt can help.
 */
export async function sendScanEmailCall({ scanId, messages }: SendScanEmailCallOptions): Promise<ResendCallResult> {
	// no retry can supply a missing key or from-address
	const emailKind = messages[0]?.emailKind ?? "topic-scan"
	const resendConfig = toResendConfig(emailKind)
	if (!resendConfig) {
		return { outcome: "rejected", failure: { httpStatus: null, resendError: "missing configuration" } }
	}

	// one message posts to the single endpoint and several to the batch endpoint.
	// the key names the exact body, so a retry of the same body gets Resend's first response back instead of a second email
	const isBatch = messages.length > 1
	const resendBodies = messages.map((message) => toResendEmailBody(message, resendConfig.fromEmail))
	const requestBody = JSON.stringify(isBatch ? resendBodies : resendBodies[0])
	const idempotencyKey = `${emailKind}/${scanId}/${Bun.hash(requestBody).toString(36)}`

	// wait for the rate limit slot, then post the call
	try {
		await waitForResendSlot()
		const response = await fetch(isBatch ? RESEND_BATCH_URL : RESEND_EMAIL_URL, {
			method: "POST",
			headers: { ...toResendHeaders(resendConfig.apiKey), "Idempotency-Key": idempotencyKey },
			body: requestBody,
			signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
		})
		if (response.ok) {
			console.log(`resend accepted ${messages.length} ${emailKind} emails for scan ${scanId}`)
			return { outcome: "accepted" }
		}

		// read what Resend rejected and whether waiting can fix it
		const errorBody = await response.text()
		console.error(`resend ${emailKind} call for scan ${scanId} failed: ${response.status} ${errorBody}`)
		const resendFailure = { httpStatus: response.status, resendError: toResendErrorName(errorBody) }
		return toFailedResendCallResult(resendFailure, response.headers.get("retry-after"))
	} catch (error) {
		// a network failure is worth another attempt
		console.error(`resend ${emailKind} call for scan ${scanId} threw`, error)
		const resendError = error instanceof Error ? error.message : String(error)
		return { outcome: "retryable", failure: { httpStatus: null, resendError }, retryAfterSeconds: null }
	}
}

// wait until the rate limit slot is free, and take it. if Redis cannot be reached, the call goes ahead without the slot
async function waitForResendSlot(): Promise<void> {
	for (;;) {
		// take the slot, or learn how long until it frees
		const waitMs = await takeRateLimitSlot({ key: RESEND_SLOT_KEY, slotMs: RESEND_SLOT_MS })
		if (waitMs === null || waitMs === 0) {
			return
		}
		await Bun.sleep(waitMs)
	}
}

// sort a failed call into retryable or rejected. a 5xx, a rate limit that is not a spent quota, and a busy idempotency
// key are retryable
function toFailedResendCallResult(resendFailure: ResendFailure, retryAfterHeader: string | null): ResendCallResult {
	const httpStatus = resendFailure.httpStatus ?? 0
	const isRateLimited = httpStatus === 429 && !RESEND_QUOTA_ERRORS.has(resendFailure.resendError)
	const isIdempotencyKeyBusy = httpStatus === 409 && resendFailure.resendError === "concurrent_idempotent_requests"
	if (httpStatus < 500 && !isRateLimited && !isIdempotencyKeyBusy) {
		return { outcome: "rejected", failure: resendFailure }
	}

	// a rate limit waits as long as Resend asked, and anything else waits on the retry policy's backoff
	const retryAfterSeconds = Number(retryAfterHeader)
	const isRetryAfterUsable = isRateLimited && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
	const usableRetryAfterSeconds = isRetryAfterUsable ? retryAfterSeconds : null
	return { outcome: "retryable", failure: resendFailure, retryAfterSeconds: usableRetryAfterSeconds }
}

// post a batch of messages to Resend's batch endpoint
async function sendEmailBatch(messagesBatch: EmailMessage[], resendConfig: ResendConfig): Promise<boolean> {
	// the batch's messages all come from one caller, so the first message names the kind for the logs
	const emailKind = messagesBatch[0]?.emailKind ?? "topic-scan"

	// wait for the rate limit slot, then post the batch
	try {
		await waitForResendSlot()
		const response = await fetch(RESEND_BATCH_URL, {
			method: "POST",
			headers: toResendHeaders(resendConfig.apiKey),
			body: JSON.stringify(messagesBatch.map((message) => toResendEmailBody(message, resendConfig.fromEmail))),
			signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
		})
		if (!response.ok) {
			// every recipient in a rejected batch silently misses their email, so the rejection is reported
			const errorBody = await response.text()
			console.error(
				`resend batch of ${messagesBatch.length} ${emailKind} emails failed: ${response.status} ${errorBody}`,
			)
			reportError(new Error(`resend rejected the batch with ${response.status}`), "email", {
				status: String(response.status),
				emailKind,
				batchSize: String(messagesBatch.length),
				resendError: toResendErrorName(errorBody),
			})
			return false
		}

		// a batch is atomic, so an accepted call returns one id per message
		const acceptedIds = ((await response.json().catch(() => null)) as { data?: unknown[] } | null)?.data
		if (acceptedIds && acceptedIds.length !== messagesBatch.length) {
			reportError(new Error("resend accepted a batch without an id for every message"), "email", {
				emailKind,
				batchSize: String(messagesBatch.length),
				acceptedCount: String(acceptedIds.length),
			})
		}

		// log the batch size, so an accepted batch that never arrives can be traced in resend
		console.log(`resend accepted a batch of ${messagesBatch.length} ${emailKind} emails`)
		return true
	} catch (error) {
		console.error(`resend batch of ${messagesBatch.length} ${emailKind} emails threw`, error)
		reportError(error, "email", { emailKind, batchSize: String(messagesBatch.length) })
		return false
	}
}

// the Resend key and the verified from-address that every call needs
type ResendConfig = { apiKey: string; fromEmail: string }

// the Resend key and from-address, or null after logging and reporting that either is missing
function toResendConfig(emailKind: EmailKind): ResendConfig | null {
	const apiKey = Bun.env.RESEND_API_KEY
	const fromEmail = Bun.env.RESEND_FROM_EMAIL
	if (apiKey && fromEmail) {
		return { apiKey, fromEmail }
	}

	// log and report the missing configuration. without it no mail goes out at all
	console.error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set to send email")
	reportError(new Error("resend is not configured"), "email", { emailKind })
	return null
}

// the headers every Resend call sends
function toResendHeaders(apiKey: string): Record<string, string> {
	return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
}

// the JSON body Resend takes for one email, shared by the single and batch senders
function toResendEmailBody(message: EmailMessage, fromEmail: string): Record<string, unknown> {
	return {
		from: fromEmail,
		reply_to: Bun.env.RESEND_REPLY_EMAIL,
		to: message.to,
		subject: message.subject,
		html: message.emailContent,
		text: message.plainTextContent,
		headers: message.headers,
	}
}

/**
 * The error name out of Resend's JSON body
 */
export function toResendErrorName(errorBody: string): string {
	try {
		const { name } = JSON.parse(errorBody) as { name?: string }
		return name ?? "an unnamed error"
	} catch {
		return "an unparsed error"
	}
}

// the message id out of Resend's JSON body
async function toResendMessageId(response: Response): Promise<string> {
	try {
		const { id } = (await response.json()) as { id?: string }
		return id ?? "an unknown id"
	} catch {
		return "an unreadable id"
	}
}
