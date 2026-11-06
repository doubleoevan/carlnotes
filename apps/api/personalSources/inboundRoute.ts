// only a valid raw-body signature can acknowledge a durable received-email job
import { queuePersonalSourcesEmailEvent } from "@carlnotes/db/personalSourcesEmailConfirmations"
import { notifyPersonalSourcesEmail } from "@carlnotes/pipeline/personalSources/work"
import { isPersonalSourcesEmailEnabled } from "@carlnotes/server/personalSourcesSettings"
import { verifyResendInbound } from "@carlnotes/server/resendInbound"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"

export const personalSourcesInboundRoute = new Hono<AppEnv>().post("/webhooks/resend/inbound", async (context) => {
	// verify bytes before decoding metadata, resolving aliases, or fetching provider content
	// reject an unsigned event, and reject mail while receiving is off
	const body = await context.req.text()
	const event = verifyResendInbound({ body, headers: context.req.raw.headers })
	if (!event) {
		return context.json({ error: "invalid webhook" }, 400)
	}
	if (!isPersonalSourcesEmailEnabled()) {
		return context.json({ error: "receiving unavailable" }, 503)
	}
	// store the email durably, then start the work for each new confirmation
	const confirmationIds = await queuePersonalSourcesEmailEvent(event)
	for (const confirmationId of confirmationIds) {
		await notifyPersonalSourcesEmail(confirmationId)
	}
	return context.json({ ok: true })
})
