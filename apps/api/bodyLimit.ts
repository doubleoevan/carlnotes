// the middleware a route runs before it reads a request's body: the body limit, the rejection of a signed-out
// request before its body is read, and the wait a large body takes its turn in
import { createTurnTaker, createWeightLimiter } from "@carlnotes/server/concurrency"
import type { Context, MiddlewareHandler, Next } from "hono"
import { bodyLimit } from "hono/body-limit"
import { createMiddleware } from "hono/factory"
import { type AppEnv, currentUser } from "./currentUser"

// how large a body may be on a route without a limit of its own
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024

// the room an upload's body limit leaves past the file for the multipart envelope around it
export const MULTIPART_ENVELOPE_BYTES = 1024 * 1024

// how large a spoken question's recording may be with its multipart envelope. a minute of opus is well under a megabyte
export const VOICE_RECORDING_BODY_LIMIT_BYTES = 4 * 1024 * 1024

/**
 * Returns a body limit of the given size that rejects an oversized body with a json 413 and the given error.
 */
export function toBodyLimit(maxSizeBytes: number, error = "request body too large"): MiddlewareHandler {
	return bodyLimit({
		maxSize: maxSizeBytes,
		onError: (context) => context.json({ error }, 413),
	})
}

/**
 * Builds the middleware that rejects a visitor's request with the given error and status before the body is read.
 */
export function toSignedOutRejection(error: string, status: 401 | 404 = 401): MiddlewareHandler<AppEnv> {
	return createMiddleware<AppEnv>(async (context, next) => {
		// reject a visitor, and pass a user on
		if (!currentUser(context)) {
			return context.json({ error }, status)
		}
		await next()
	})
}

// how long a large body waits its turn, in milliseconds. past it the request gets its route's busy response, well
// inside the server's two-minute idle timeout, which closes a waiting connection with no response
const BODY_ADMISSION_WAIT_MS = 20_000

// which of a route's bodies wait their turn to be read, and how many of their bytes are in progress in the process at
// once. a body is in progress from its read until its response ends
type BodyAdmissionOptions = {
	// the route's body limit. a chunked body counts as this size, and a body past it never waits
	maxBodyBytes: number
	// a body at or under this size never waits and is never counted
	largeBodyBytes: number
	// the most bytes of large bodies in progress
	maxBytesInProgress: number
	// how long a large body waits its turn, in milliseconds
	waitMs?: number
}

// builds a route's admission middleware from the response its busy bodies get
type BodyAdmissionBuilder = (toBusyResponse: (context: Context<AppEnv>) => Response) => MiddlewareHandler<AppEnv>

/**
 * Returns the builder of the middleware that makes a large body wait its turn before it is read, so the bytes of the
 * large bodies in progress in the process stay within a total, and a user's large bodies are read one at a time. Every
 * middleware the builder returns counts against the one total. A body whose turn does not come within the wait gets
 * the response its middleware was built with, and a request aborted while it waits is never read.
 */
export function toBodyAdmission({
	maxBodyBytes,
	largeBodyBytes,
	maxBytesInProgress,
	waitMs = BODY_ADMISSION_WAIT_MS,
}: BodyAdmissionOptions): BodyAdmissionBuilder {
	// the bytes in progress across every user, and each user's turn among their own large bodies, so one account's
	// bodies take no more of the total than one body at a time
	const takeBodyBytes = createWeightLimiter(maxBytesInProgress)
	const takeUserTurn = createTurnTaker()

	// wait for the user's earlier large body to end, then for room among the bytes in progress, and resolve with the
	// release of both. rejects if the signal aborts first, with nothing left taken
	const admitBody = async (userId: string | null, bodyBytes: number, signal: AbortSignal): Promise<() => void> => {
		const endUserTurn = userId ? await takeUserTurn(userId, signal) : () => {}
		try {
			// the release returns the body's bytes, then ends its user's turn
			const releaseBodyBytes = await takeBodyBytes(bodyBytes, signal)
			return () => {
				releaseBodyBytes()
				endUserTurn()
			}
		} catch (error) {
			// a body that got no room gives its user's turn to the user's next body
			endUserTurn()
			throw error
		}
	}

	return (toBusyResponse) =>
		createMiddleware<AppEnv>(async (context, next) => {
			// read a body at or under the large size at once, and leave a body past the limit to the limit's rejection
			const bodyBytes = toDeclaredBodyBytes(context.req.raw) ?? maxBodyBytes
			if (bodyBytes <= largeBodyBytes || bodyBytes > maxBodyBytes) {
				return next()
			}

			// wait for the body's turn until the wait runs out or the request is aborted
			const requestSignal = context.req.raw.signal
			const waitSignal = AbortSignal.any([requestSignal, AbortSignal.timeout(waitMs)])
			const releaseBody = await admitBody(currentUser(context), bodyBytes, waitSignal).catch(() => null)

			// a body whose turn did not come, and a request aborted as its turn came, are never read. a wait that ran out
			// with the request still open is logged. the replica has more large bodies than it admits
			if (!releaseBody || requestSignal.aborted) {
				releaseBody?.()
				if (!requestSignal.aborted) {
					console.warn(`a large body waited ${waitMs} ms for its turn and got the busy response`)
				}
				return toBusyResponse(context)
			}

			return runAdmittedBody(context, next, releaseBody)
		})
}

// run the route on an admitted body. its bytes stay counted while the route works on it, whether or not the request
// is still open, and are released once its response has been sent or dropped
async function runAdmittedBody(context: Context<AppEnv>, next: Next, releaseBody: () => void): Promise<void> {
	try {
		await next()
	} catch (error) {
		releaseBody()
		throw error
	}

	// release at once if there is no response body. an aborted request's response is never read to its end
	if (!context.finalized || !context.res.body) {
		releaseBody()
		return
	}
	releaseOnAbort(context.req.raw.signal, releaseBody)
	context.res = new Response(toReleasingBody(context.res.body, releaseBody), context.res)
}

// the default body limit, for a route without a limit of its own
export const defaultBodyLimit = toBodyLimit(DEFAULT_BODY_LIMIT_BYTES)

// the rejection an upload route gives a visitor, before its body limit buffers the upload
export const uploadSignedOutRejection = toSignedOutRejection("unauthorized")

// the size a request declares for its body: its content length, zero for a request that declares none and so sends no
// body, or null for a chunked body, whose size is known only once it is read
function toDeclaredBodyBytes(request: Request): number | null {
	if (request.headers.has("transfer-encoding")) {
		return null
	}
	return Number.parseInt(request.headers.get("content-length") ?? "0", 10) || 0
}

// run the release once the request is aborted, or at once if it already is. an aborted request's response is never
// read to its end
function releaseOnAbort(signal: AbortSignal, release: () => void): void {
	if (signal.aborted) {
		release()
		return
	}
	signal.addEventListener("abort", release, { once: true })
}

// a response body that runs the release once it has been read to its end, has failed, or has been dropped
function toReleasingBody(body: ReadableStream<Uint8Array>, release: () => void): ReadableStream<Uint8Array> {
	const reader = body.getReader()
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			// pass each chunk on
			try {
				const { done, value } = await reader.read()
				if (!done) {
					controller.enqueue(value)
					return
				}

				// release at the body's end
				release()
				controller.close()
			} catch (error) {
				// release a body that failed
				release()
				controller.error(error)
			}
		},
		// release a body that is dropped before its end, and stop the body it reads
		cancel(reason) {
			release()
			return reader.cancel(reason)
		},
	})
}
