// outbound and inbound provider calls share one Redis slot across all replicas
import { takeRateLimitSlot } from "./redisRateLimits"

const RESEND_SLOT_KEY = "rate-limit:resend-calls"
const RESEND_SLOT_MS = 200
const RESEND_SLOT_WAIT_LIMIT_MS = 10_000
const RESEND_SLOT_JITTER_MS = 50

/**
 * Waits for the shared Resend rate-limit slot, with the existing bounded outage fallback.
 */
export async function waitForResendSlot(): Promise<void> {
	const slotWaitDeadlineAt = Date.now() + RESEND_SLOT_WAIT_LIMIT_MS
	for (;;) {
		// take the slot, or learn how long until it frees
		const waitMs = await takeRateLimitSlot({ key: RESEND_SLOT_KEY, slotMs: RESEND_SLOT_MS })
		if (waitMs === null || waitMs === 0 || Date.now() + waitMs > slotWaitDeadlineAt) {
			return
		}
		await Bun.sleep(waitMs + Math.random() * RESEND_SLOT_JITTER_MS)
	}
}
