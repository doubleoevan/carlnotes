// the invitation email a newly invited address receives when a topic owner adds it to a public or invite topic.
// it reuses the one-link auth-email template with the invitation's own words: who invited, to what,
// and that the invitation is tied to this address. the link leads to the topic page.
// an invite topic's gate walks a signed-out invitee through login or signup and back.
// authored as a react-email template like the others, so it previews with `bun run dev:email`
import { Link } from "@react-email/components"
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import AuthEmail, { type AuthEmailProps } from "./auth-email"
import { summaryLink } from "./topic-scan-email"

// what an invitation says: who invited, to which topic, and the address the invitation is tied to
export type TopicInviteEmailProps = {
	inviterUsername: string
	topicName: string
	// the invited address, named in the email because topic access is keyed to it
	inviteeEmail: string
	topicUrl: string
	appUrl?: string
}

/**
 * The invitation's subject line, built beside the body so the two always name the same user.
 */
export function toTopicInviteSubject({ inviterUsername, topicName }: TopicInviteEmailProps): string {
	return `${inviterUsername} invited you to follow ${topicName} on CarlNotes`
}

// the invitation's words for the shared one-link template. the lead is built twice from the same
// pieces: plain for the inbox preheader, and with the topic name linking to its page for the body
function toAuthEmailProps({
	inviterUsername,
	topicName,
	inviteeEmail,
	topicUrl,
	appUrl,
}: TopicInviteEmailProps): AuthEmailProps {
	const invitedYou = `${inviterUsername} invited you to follow `
	const carlNote = ". Carl reads its sources on a schedule and takes notes, so the people on the list don't have to."
	return {
		heading: "You're invited",
		lead: `${invitedYou}${topicName}${carlNote}`,
		leadContent: (
			<>
				{invitedYou}
				<Link href={topicUrl} style={summaryLink}>
					{topicName}
				</Link>
				{carlNote}
			</>
		),
		buttonLabel: "See the topic",
		url: topicUrl,
		linkNote: `This invitation is for ${inviteeEmail}. Sign up or log in with this address and the topic opens for you. Subscribing is your call once you've had a look.`,
		closingNote: "Not interested? You can ignore this email and nothing will change.",
		appUrl,
	}
}

// apply the single link template with the invitation's words
export default function TopicInviteEmail(props: TopicInviteEmailProps): ReactElement {
	return <AuthEmail {...toAuthEmailProps(props)} />
}

// what `bun run dev:email` renders this template with
TopicInviteEmail.PreviewProps = {
	inviterUsername: "doubleoevan",
	topicName: "Raccoons in the News",
	inviteeEmail: "friend@example.com",
	topicUrl: "https://carlnotes.com/topics/preview",
	appUrl: "https://carlnotes.com",
} satisfies TopicInviteEmailProps

// render the template to an HTML string for sending. the api calls this at send-email time
export function renderTopicInviteEmail(props: TopicInviteEmailProps): Promise<string> {
	return render(<TopicInviteEmail {...props} />)
}

// the same email as plain text, sent with the HTML so the message is not html-only.
// a message with no text part reads as machine-generated and goes to a spam filter.
// also, some clients and screen readers show this instead of HTML
export function renderTopicInviteEmailText(props: TopicInviteEmailProps): Promise<string> {
	return render(<TopicInviteEmail {...props} />, { plainText: true })
}
