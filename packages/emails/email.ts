// send email through Resend's HTTP API. every call first takes a slot from a rate limit that every process shares, an
// account email from the account emails' own limit

import { waitForAccountEmailSlot, waitForResendSlot } from "@carlnotes/db/resendRateLimit"
import { reportError } from "@carlnotes/server/monitoring"
import { toEmailSenderAddress } from "@carlnotes/server/personalSourcesEmailContent"
import { runWithRetries } from "@carlnotes/server/retry"
import { z } from "zod"

// the account emails, each sent to one address on its own
const ACCOUNT_EMAIL_KINDS = ["verification", "password-reset", "email-change", "topic-invite", "team-invite"] as const
type AccountEmailKind = (typeof ACCOUNT_EMAIL_KINDS)[number]

// which kind of email is being sent, so a blocked signup reports differently from a missed scan email
export type EmailKind =
	| AccountEmailKind
	// the reading emails, which a scan sends in batches
	| "topic-scan"
	| "manual-scan"
	| "flag-content"
	| "personal-sources"
	// the daily email about what others wrote on a user's things
	| "notifications"

// one email to send, shared by the single and batch senders
export type EmailMessage = {
	to: string
	subject: string
	emailContent: string
	// the same email message as text, sent with the HTML
	plainTextContent?: string
	emailKind: EmailKind
	headers?: Record<string, string>
	replyTo?: string
}

// one account email to send
type AccountEmailMessage = EmailMessage & { emailKind: AccountEmailKind }

// a failed Resend call's HTTP status, null without a response, and Resend's error name
export type ResendFailure = { httpStatus: number | null; resendError: string }

// the result of one Resend call under an idempotency key
export type ResendCallResult =
	| { outcome: "accepted" }
	// a rate limit, a busy idempotency key, a 5xx, or a network failure. retryAfterSeconds is Resend's own wait, if it sent one
	| { outcome: "retryable"; failure: ResendFailure; retryAfterSeconds: number | null }
	// any other rejection, a spent quota, or missing configuration
	| { outcome: "rejected"; failure: ResendFailure }

// a Resend call that did not accept an account email, with the call's result
class AccountEmailCallFailure extends Error {
	constructor(readonly failedResendCallResult: Exclude<ResendCallResult, { outcome: "accepted" }>) {
		super("an account email was not delivered")
	}
}

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

// how many attempts an account email gets, and the wait after its first failed attempt if Resend names none. each
// later wait doubles
const ACCOUNT_EMAIL_ATTEMPTS = 6
const ACCOUNT_EMAIL_BACKOFF_MS = 5000

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
		await waitForEmailSlot(message.emailKind)
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
 * Sends one account email and returns whether Resend accepted it. A rate limit that is not a spent quota, a 5xx, and a
 * network failure get another attempt under the same idempotency key, a rate limit after the wait Resend named. A
 * send that no attempt can help, or that fails every attempt, is reported by its kind.
 */
export async function sendAccountEmail(message: AccountEmailMessage): Promise<boolean> {
	// one delivery id for every attempt, so an attempt whose response was lost sends no second copy
	const deliveryId = crypto.randomUUID()

	// ponytail: the attempts wait in this process's memory, and a restart drops an email waiting for its next attempt.
	// a Temporal workflow would finish the attempts after a restart if deploys during a Resend outage lose mail
	try {
		// attempt the send until Resend accepts it or no other attempt can help
		await runWithRetries({
			attempts: ACCOUNT_EMAIL_ATTEMPTS,
			runAttempt: () => sendAccountEmailCall(deliveryId, message),
			toDelayMs: toAccountEmailRetryDelayMs,
		})
		return true
	} catch (error) {
		// throw an error that is not a Resend call's result
		if (!(error instanceof AccountEmailCallFailure)) {
			throw error
		}

		// log and report the undelivered email by its kind and what Resend said, never by its address
		const { httpStatus, resendError } = error.failedResendCallResult.failure
		const statusLabel = String(httpStatus ?? "no response")
		console.error(`the ${message.emailKind} email was not delivered: ${statusLabel} ${resendError}`)
		reportError(error, "email", { emailKind: message.emailKind, status: statusLabel, resendError })
		return false
	}
}

// make one Resend call for an account email, and throw the call's result if Resend did not accept it
async function sendAccountEmailCall(deliveryId: string, message: AccountEmailMessage): Promise<void> {
	const resendCallResult = await sendIdempotentEmailCall({ deliveryId, messages: [message], hasStableKey: true })
	if (resendCallResult.outcome !== "accepted") {
		throw new AccountEmailCallFailure(resendCallResult)
	}
}

// the wait before an account email's next attempt, which is the wait Resend named or a backoff that doubles with each
// failed attempt. null for a failure that no other attempt can help
function toAccountEmailRetryDelayMs(error: unknown, attempt: number): number | null {
	if (!(error instanceof AccountEmailCallFailure) || error.failedResendCallResult.outcome !== "retryable") {
		return null
	}

	// a rate limit waits as long as Resend asked, and any other failure waits on the backoff
	const { retryAfterSeconds } = error.failedResendCallResult
	return retryAfterSeconds === null ? ACCOUNT_EMAIL_BACKOFF_MS * 2 ** (attempt - 1) : retryAfterSeconds * 1000
}

/**
 * Sends one Resend call for a Scan's email, one message or a batch, under an idempotency key made of the email kind,
 * the Scan, and a hash of the request body. Returns whether Resend accepted the call, and for a failure whether another
 * attempt can help.
 */
export async function sendScanEmailCall({ scanId, messages }: SendScanEmailCallOptions): Promise<ResendCallResult> {
	return sendIdempotentEmailCall({ deliveryId: scanId, messages })
}

/**
 * Sends a retryable delivery after its email kind's rate limit slot, without logging private request or error text.
 */
export async function sendIdempotentEmailCall({
	deliveryId,
	messages,
	hasStableKey = false,
}: {
	deliveryId: string
	messages: EmailMessage[]
	hasStableKey?: boolean
}): Promise<ResendCallResult> {
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
	const idempotencyKey = `${emailKind}/${deliveryId}${hasStableKey ? "" : `/${Bun.hash(requestBody).toString(36)}`}`

	// wait for the rate limit slot, then post the call
	try {
		await waitForEmailSlot(emailKind)
		const response = await fetch(isBatch ? RESEND_BATCH_URL : RESEND_EMAIL_URL, {
			method: "POST",
			headers: { ...toResendHeaders(resendConfig.apiKey), "Idempotency-Key": idempotencyKey },
			body: requestBody,
			signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
		})
		if (response.ok) {
			console.log(`resend accepted ${messages.length} ${emailKind} emails for delivery ${deliveryId}`)
			return { outcome: "accepted" }
		}

		// read what Resend rejected and whether waiting can fix it
		const errorBody = await response.text()
		console.error(`resend ${emailKind} call for delivery ${deliveryId} failed: ${response.status}`)
		const resendFailure = { httpStatus: response.status, resendError: toResendErrorName(errorBody) }
		return toFailedResendCallResult(resendFailure, response.headers.get("retry-after"))
	} catch {
		// a network failure is worth another attempt
		console.error(`resend ${emailKind} call for delivery ${deliveryId} failed without a response`)
		const resendError = "network failure"
		return { outcome: "retryable", failure: { httpStatus: null, resendError }, retryAfterSeconds: null }
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

// wait for a slot of the account emails' own limit for an account email, and of the shared limit for any other email
function waitForEmailSlot(emailKind: EmailKind): Promise<void> {
	const isAccountEmail = (ACCOUNT_EMAIL_KINDS as readonly EmailKind[]).includes(emailKind)
	return isAccountEmail ? waitForAccountEmailSlot() : waitForResendSlot()
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
	// every Carl email replies to the shared receiving mailbox
	const replyTo = toEmailSenderAddress(fromEmail) ?? undefined
	return {
		from:
			message.emailKind === "personal-sources" ? `Carl <${toEmailSenderAddress(fromEmail) ?? fromEmail}>` : fromEmail,
		reply_to: message.replyTo ?? replyTo,
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
