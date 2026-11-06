// webhook acknowledgement follows authentication and durable storage, with no provider fetch in the route
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as confirmations from "@carlnotes/db/personalSourcesEmailConfirmations"
import * as work from "@carlnotes/pipeline/personalSources/work"
import {
	FIXTURE_EMAIL_ID,
	FIXTURE_PERSONAL_SOURCES_ADDRESS,
	FIXTURE_WEBHOOK_SECRET,
	signedPersonalSourcesWebhook,
} from "@carlnotes/server/personalSourcesEmailTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { personalSourcesInboundRoute } from "./inboundRoute"

const restoreEnvSettings = saveEnvSettings([
	"RESEND_INBOUND_WEBHOOK_SECRET",
	"PERSONAL_SOURCES_RECEIVING_ENABLED",
	"PERSONAL_SOURCES_EMAIL_ENABLED",
])
afterEach(() => {
	mock.restore()
	restoreEnvSettings()
})

test("invalid signatures never resolve addresses or dispatch provider work", async () => {
	Bun.env.RESEND_INBOUND_WEBHOOK_SECRET = FIXTURE_WEBHOOK_SECRET
	const queued = spyOn(confirmations, "queuePersonalSourcesEmailEvent").mockResolvedValue([])
	const notified = spyOn(work, "notifyPersonalSourcesEmail").mockResolvedValue()
	// an unsigned body stops before either step
	const response = await personalSourcesInboundRoute.request("/webhooks/resend/inbound", { method: "POST", body: "{}" })
	expect(response.status).toBe(400)
	expect(queued).not.toHaveBeenCalled()
	expect(notified).not.toHaveBeenCalled()
})

test("signed mail acknowledges only after durable handoff, including duplicate delivery", async () => {
	Bun.env.RESEND_INBOUND_WEBHOOK_SECRET = FIXTURE_WEBHOOK_SECRET
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	Bun.env.PERSONAL_SOURCES_EMAIL_ENABLED = "true"
	// the first delivery queues one confirmation, and a duplicate queues none
	const queued = spyOn(confirmations, "queuePersonalSourcesEmailEvent")
		.mockResolvedValueOnce(["confirmation"])
		.mockResolvedValue([])
	const notified = spyOn(work, "notifyPersonalSourcesEmail").mockResolvedValue()
	const body = JSON.stringify({
		type: "email.received",
		data: { from: "owner@example.com", email_id: FIXTURE_EMAIL_ID, to: [FIXTURE_PERSONAL_SOURCES_ADDRESS] },
	})
	for (let i = 0; i < 2; i += 1) {
		expect(
			(
				await personalSourcesInboundRoute.request("/webhooks/resend/inbound", {
					method: "POST",
					body,
					headers: signedPersonalSourcesWebhook(body),
				})
			).status,
		).toBe(200)
	}
	expect(queued).toHaveBeenCalledTimes(2)
	expect(notified).toHaveBeenCalledTimes(1)
	expect(notified.mock.calls[0]).toEqual(["confirmation"])
})
