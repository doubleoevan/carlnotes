// Clarification replies can file the original delivery only against current, sender-owned choices.
import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import * as receipts from "@carlnotes/db/personalSourcesEmailReceipts"
import * as receiving from "@carlnotes/db/personalSourcesSend"
import * as replies from "@carlnotes/emails/personalSourcesEmail"
import { personalSourcesEmailFixture } from "@carlnotes/server/personalSourcesEmailTestFixtures"
import * as provider from "@carlnotes/server/resendInbound"
import { processPersonalSourcesEmail } from "./email"
import { restorePersonalSourcesEmail, setReply, stubPersonalSourcesEmail } from "./emailTestFixtures"
import * as routing from "./emailTopic"

// Each test receives the account installed in its provider and database stubs.
let destination: receipts.AccountEmailDestination
beforeEach(() => {
	destination = stubPersonalSourcesEmail()
})
afterEach(restorePersonalSourcesEmail)

// choice replies retain metadata only and fetch original content after ownership checks
const choiceRequestId = "9101167a-feda-432b-ae30-ab25e98ff350"
const originalEmailId = "a0890d0c-3278-44f8-a05c-7fec2196c315"
const choiceTopics = [{ id: "topic", name: "Coffee", url: "https://carlnotes.com/topics/topic" }]

test("a queued clarification with revoked Topic access never sends the old name or link", async () => {
	setReply(destination, { kind: "needs_topic", requestId: choiceRequestId, topics: choiceTopics })
	spyOn(receipts, "loadPersonalSourcesEmailChoices").mockResolvedValue({
		id: choiceRequestId,
		emailId: originalEmailId,
		messageId: "<original@example.com>",
		topics: [],
	})
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
})

test("clarification saves numbered choices without filing the original", async () => {
	destination.receipt.id = choiceRequestId
	spyOn(provider, "fetchReceivedPersonalSourcesEmail").mockResolvedValue({
		status: "received",
		email: personalSourcesEmailFixture({ message_id: "<original@example.com>" }),
	})
	spyOn(routing, "resolvePersonalSourcesEmailTopics").mockResolvedValue({ topicIds: [], suggestions: choiceTopics })
	const saveChoices = spyOn(receipts, "savePersonalSourcesEmailChoices").mockResolvedValue()
	spyOn(receipts, "loadPersonalSourcesEmailChoices").mockResolvedValue({
		id: choiceRequestId,
		emailId: originalEmailId,
		messageId: "<original@example.com>",
		topics: choiceTopics,
	})
	await processPersonalSourcesEmail(choiceRequestId)
	expect(saveChoices.mock.calls[0]?.[1]).toEqual({
		receiptId: choiceRequestId,
		userId: "owner",
		topics: choiceTopics,
		messageId: "<original@example.com>",
	})
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].reply).toMatchObject({
		kind: "needs_topic",
		requestId: choiceRequestId,
		topics: choiceTopics,
	})
})

test.each([false, true])(
	"number replies use the sender-owned original, or ignore foreign references: %s",
	async (isOwned) => {
		spyOn(receipts, "loadPersonalSourcesEmailChoices").mockResolvedValue(
			isOwned
				? { id: choiceRequestId, emailId: originalEmailId, messageId: "<original@example.com>", topics: choiceTopics }
				: null,
		)
		spyOn(provider, "fetchReceivedPersonalSourcesEmail")
			.mockResolvedValueOnce({
				status: "received",
				email: personalSourcesEmailFixture({
					subject: "Re: Coffee",
					text: "1",
					headers: { "In-Reply-To": "<carl-provider@example.com>", References: "<original@example.com>" },
					message_id: "<reply@example.com>",
				}),
			})
			.mockResolvedValueOnce({
				status: "received",
				email: personalSourcesEmailFixture({ id: originalEmailId, text: "Original request https://example.org/page" }),
			})
		await processPersonalSourcesEmail("receipt")
		const send = spyOn(receiving, "receivePersonalSourcesSend")
		if (!isOwned) {
			expect(send).not.toHaveBeenCalled()
			expect(spyOn(provider, "fetchReceivedPersonalSourcesEmail")).toHaveBeenCalledTimes(1)
			expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
			return
		}
		expect(send.mock.calls[0]?.[0]).toMatchObject({
			topicIds: ["topic"],
			requestId: originalEmailId,
			payload: { text: "Original request https://example.org/page" },
		})
		expect(spyOn(replies, "sendPersonalSourcesEmailReply").mock.calls[0]?.[0].reply).toMatchObject({
			subject: "Re: Coffee",
			inReplyTo: "<reply@example.com>",
		})
	},
)

test("a completed choice request cannot file again or send another confirmation", async () => {
	spyOn(receipts, "loadPersonalSourcesEmailChoices")
		.mockResolvedValueOnce({
			id: choiceRequestId,
			emailId: originalEmailId,
			messageId: "<original@example.com>",
			topics: choiceTopics,
		})
		.mockResolvedValueOnce(null)
	spyOn(provider, "fetchReceivedPersonalSourcesEmail")
		.mockResolvedValueOnce({
			status: "received",
			email: personalSourcesEmailFixture({
				text: "1",
				headers: { "In-Reply-To": "<carl-provider@example.com>", References: "<original@example.com>" },
			}),
		})
		.mockResolvedValueOnce({ status: "received", email: personalSourcesEmailFixture({ id: originalEmailId }) })
	await processPersonalSourcesEmail("receipt")
	expect(spyOn(receiving, "receivePersonalSourcesSend")).not.toHaveBeenCalled()
	expect(spyOn(replies, "sendPersonalSourcesEmailReply")).not.toHaveBeenCalled()
})
