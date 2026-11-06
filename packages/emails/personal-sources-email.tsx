// email replies use the same Nightshift email shell as CarlNotes account mail
import type { PersonalSourcesEmailReply } from "@carlnotes/contracts/personalSourcesEmail"
import { SITE_URL } from "@carlnotes/contracts/site"
import { emailColors, toEmailFontSize } from "@carlnotes/nightshift/email"
import { Link, Section, Text } from "@react-email/components"
import type { CSSProperties } from "react"
import AuthEmail, { type AuthEmailProps } from "./auth-email"
import { EmailIntro, EmailShell, summaryLink } from "./emailShell"

// reply snapshots contain destinations and an outcome, never an unmatched email body
export type PersonalSourcesEmailProps = {
	reply: PersonalSourcesEmailReply
	receivingAddress: string
	appUrl?: string
}

/**
 * Confirms saved destinations or asks for a clearer new request.
 */
export default function PersonalSourcesEmail({
	reply,
	receivingAddress,
	appUrl = SITE_URL,
}: PersonalSourcesEmailProps) {
	if (reply.kind === "needs_topic" && reply.requestId) {
		return (
			<EmailShell preview="Which topics should Carl use?">
				<EmailIntro heading="Which topics should Carl use?" />
				{reply.topics?.length ? (
					<ol style={topicList}>
						{reply.topics.map((topic) => (
							<li key={topic.id} style={topicItem}>
								<Link href={topic.url} style={summaryLink}>
									{topic.name}
								</Link>
							</li>
						))}
					</ol>
				) : null}
				<Text>
					{reply.topics?.length
						? "Reply with numbers, topic names, or both. Separate them with commas."
						: "Reply with the names of the topics you want to use. Separate them with commas."}
				</Text>
			</EmailShell>
		)
	}
	if (reply.kind !== "filed") {
		return <AuthEmail {...toUnfiledReplyProps(reply, receivingAddress, appUrl)} />
	}
	return (
		<EmailShell preview="Carl sent your message to these topics:">
			<EmailIntro heading="Carl sent your message to these topics:" />
			<Section>
				<ol style={topicList}>
					{reply.topics.map((topic) => (
						<li key={topic.entryId} style={topicItem}>
							<Link href={topic.url} style={summaryLink}>
								{topic.name}
							</Link>
						</li>
					))}
				</ol>
			</Section>
		</EmailShell>
	)
}

// preview the same numbered confirmation a multi-Topic filing produces
PersonalSourcesEmail.PreviewProps = {
	receivingAddress: "carl@example.com",
	reply: {
		kind: "filed",
		topics: [
			{ name: "LLM evals", url: `${SITE_URL}/topics/evals`, entryId: "preview-evals" },
			{ name: "Agent infrastructure", url: `${SITE_URL}/topics/agents`, entryId: "preview-agents" },
		],
	},
} satisfies PersonalSourcesEmailProps

/**
 * Names the filing outcome without copying a private subject into the outgoing header.
 */
export function toPersonalSourcesEmailSubject(reply: PersonalSourcesEmailProps["reply"]): string {
	if (reply.kind === "filed") {
		return "Carl sent your message to these topics:"
	}
	return reply.kind === "needs_topic" ? "Which topic should Carl use?" : "Carl could not file your email"
}

// explain the next step without quoting the original request
function toUnfiledReplyProps(
	reply: Exclude<PersonalSourcesEmailProps["reply"], { kind: "filed" }>,
	receivingAddress: string,
	appUrl: string,
): AuthEmailProps {
	if (reply.kind === "not_filed" && reply.reason === "account") {
		return {
			heading: "Email Carl from your CarlNotes account",
			lead: "Send your message again from the email address you use for CarlNotes.",
			buttonLabel: "Sign in to CarlNotes",
			url: `${appUrl}/login`,
			closingNote: null,
		}
	}
	if (reply.kind === "not_filed" && reply.reason === "plan") {
		return {
			heading: "Email Carl with Plus or Premium",
			lead: "Choose Plus or Premium to send email to your topics.",
			buttonLabel: "See plans",
			url: `${appUrl}/plans`,
			closingNote: null,
		}
	}
	return {
		heading: toPersonalSourcesEmailSubject(reply),
		lead: toUnfiledReplyText(reply, receivingAddress),
		buttonLabel: "Email Carl guide",
		url: `${appUrl}/docs/topics/email-carl/`,
		closingNote: null,
	}
}

// ask for a new request without retaining its original content
function toUnfiledReplyText(
	reply: Exclude<PersonalSourcesEmailProps["reply"], { kind: "filed" }>,
	receivingAddress: string,
): string {
	if (reply.kind === "needs_topic") {
		return `Which topic is this for? Email your message to ${receivingAddress} again with "topic: Topic name" in the subject or first line.`
	}
	if (reply.reason === "quota") {
		return "The day's email limit is reached. Nothing was saved. Send your message again after midnight UTC."
	}
	return "Carl couldn't save this message. Check that you can edit the topic, then send your message again."
}

// match the existing email type roles and link colors without adding a second palette
const topicList: CSSProperties = {
	color: emailColors.foreground,
	fontSize: toEmailFontSize("body"),
	paddingLeft: "24px",
}
const topicItem: CSSProperties = { padding: "6px 0" }
