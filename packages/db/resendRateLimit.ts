// the two limits on calls to Resend, each a Redis slot that every api and worker process shares. account emails have a
// limit of their own, and every other outbound and inbound call shares the other
import { type TakeRateLimitSlotOptions, takeRateLimitSlot } from "./redisRateLimits"

// the shared limit's slot, which one call holds for 200 milliseconds, so its calls leave five a second
const RESEND_SLOT: TakeRateLimitSlotOptions = { key: "rate-limit:resend-calls", slotMs: 200 }

// the account emails' slot, which one call holds for 250 milliseconds, so account emails leave four a second. the two
// limits together allow nine calls a second, one under Resend's limit of ten a second for a team
const ACCOUNT_EMAIL_SLOT: TakeRateLimitSlotOptions = { key: "rate-limit:resend-account-emails", slotMs: 250 }

// how long a call waits for a slot before it goes out without one, and the most jitter that one wait gets
const RESEND_SLOT_WAIT_LIMIT_MS = 10_000
const RESEND_SLOT_JITTER_MS = 50

/**
 * Waits for a slot of the limit that every call to Resend but an account email shares.
 */
export function waitForResendSlot(): Promise<void> {
	return waitForSlot(RESEND_SLOT)
}

/**
 * Waits for a slot of the account emails' own limit, so an account email never waits behind a bulk send.
 */
export function waitForAccountEmailSlot(): Promise<void> {
	return waitForSlot(ACCOUNT_EMAIL_SLOT)
}

// wait until this call takes the slot. the call goes out without the slot once its wait would pass the wait limit, or
// if Redis cannot be reached
async function waitForSlot(rateLimitSlot: TakeRateLimitSlotOptions): Promise<void> {
	const slotWaitDeadlineAt = Date.now() + RESEND_SLOT_WAIT_LIMIT_MS
	for (;;) {
		// take the slot, or learn how long until it frees
		const waitMs = await takeRateLimitSlot(rateLimitSlot)
		if (waitMs === null || waitMs === 0 || Date.now() + waitMs > slotWaitDeadlineAt) {
			return
		}
		await Bun.sleep(waitMs + Math.random() * RESEND_SLOT_JITTER_MS)
	}
}
