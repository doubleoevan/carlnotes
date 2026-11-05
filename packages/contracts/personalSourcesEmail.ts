// Resend wire fields used by receiving. Download URLs and message-supplied authentication headers are ignored
import { z } from "zod"

// the validated mailbox exposed by the server's digest sender configuration
export const personalSourcesEmailAddress = z.email()

export const receivedEmailEvent = z.object({
	type: z.literal("email.received"),
	data: z.object({ email_id: z.uuid(), from: z.string().max(1024), to: z.array(z.string().max(320)).max(100) }),
})
export const receivedPersonalSourcesEmail = z.object({
	id: z.uuid(),
	to: z.array(z.string().max(320)).max(100),
	from: z.string().max(1024),
	subject: z.string().max(10_000).nullish(),
	text: z.string().nullish(),
	html: z.string().nullish(),
	message_id: z.string().nullish(),
	headers: z.record(z.string(), z.string()).default({}),
	authentication: z.object({ spf: z.string(), dkim: z.string(), dmarc: z.string() }).nullish(),
})
export type ReceivedEmailEvent = z.infer<typeof receivedEmailEvent>
export type ReceivedPersonalSourcesEmail = z.infer<typeof receivedPersonalSourcesEmail>

// Resend serializes parsed mailing-list headers into a JSON-valued list header
export const receivedEmailListHeaders = z.object({
	id: z.object({ id: z.string().min(1).max(2048) }).optional(),
	unsubscribe: z.object({ url: z.string().max(4096).optional(), mail: z.string().max(320).optional() }).optional(),
})

// confirmation and clarification snapshots contain no original message text
export const personalSourcesEmailTopicChoices = z
	.array(z.object({ id: z.string(), name: z.string(), url: z.url() }))
	.max(5)
export type PersonalSourcesEmailTopicChoice = z.infer<typeof personalSourcesEmailTopicChoices>[number]

const filedEmailReply = z.object({
	kind: z.literal("filed"),
	topics: z.array(z.object({ name: z.string(), url: z.url(), entryId: z.string() })).min(1),
})
export const personalSourcesEmailReply = z
	.union([
		filedEmailReply,
		z.object({
			kind: z.literal("needs_topic"),
			requestId: z.uuid().optional(),
			topics: personalSourcesEmailTopicChoices.optional(),
		}),
		z.object({ kind: z.literal("not_filed"), reason: z.enum(["quota", "unavailable", "plan", "account"]) }),
	])
	.and(
		z.object({
			subject: z.string().max(998).optional(),
			references: z.string().max(32000).optional(),
			inReplyTo: z
				.string()
				.max(998)
				.regex(/^<[^<>\s]+>$/)
				.optional(),
		}),
	)
export type PersonalSourcesEmailReply = z.infer<typeof personalSourcesEmailReply>
