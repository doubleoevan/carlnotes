// the email a typed-address team invitation sends: who invited them, which team, and the invite url
import { Link } from "@react-email/components"
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import AuthEmail, { type AuthEmailProps } from "./auth-email"
import { summaryLink } from "./topic-scan-email"

export type TeamInviteEmailProps = {
	senderUsername: string
	teamName: string
	// the invited address, named in the email so the recipient knows which of their addresses was invited
	recipientEmail: string
	// the invite url, which redeems their invitation whatever address they sign in with
	inviteUrl: string
	appUrl?: string
}

/**
 * The invitation's subject line, built beside the body so the two always name the same team.
 */
export function toTeamInviteSubject({ senderUsername, teamName }: TeamInviteEmailProps): string {
	return `${senderUsername} invited you to join ${teamName} on CarlNotes`
}

// the invitation's words for the shared one-link template. the leader is built twice from the same pieces:
// plain for the inbox preheader, and with the team name linking through the invite url
function toAuthEmailProps({
	senderUsername,
	teamName,
	recipientEmail,
	inviteUrl,
	appUrl,
}: TeamInviteEmailProps): AuthEmailProps {
	const inviteNote = `${senderUsername} invited you to join `
	const teamNote = ". A team edits its topics together and shares a Coffee talk with Carl."
	return {
		heading: "You're invited",
		lead: `${inviteNote}${teamName}${teamNote}`,
		leadContent: (
			<>
				{inviteNote}
				<Link href={inviteUrl} style={summaryLink}>
					{teamName}
				</Link>
				{teamNote}
			</>
		),
		buttonLabel: "Join the team",
		url: inviteUrl,
		linkNote: `This invitation was sent to ${recipientEmail}. Sign up or log in and the team opens for you. Joining is your call once you've had a look.`,
		closingNote: "Not interested? Ignore this email and nothing will change.",
		appUrl,
	}
}

// apply the single link template with the invitation's words
export default function TeamInviteEmail(props: TeamInviteEmailProps): ReactElement {
	return <AuthEmail {...toAuthEmailProps(props)} />
}

// what `bun run dev:email` renders this template with
TeamInviteEmail.PreviewProps = {
	senderUsername: "doubleoevan",
	teamName: "Raccoon Crew",
	recipientEmail: "friend@example.com",
	inviteUrl: "https://carlnotes.com/invite/preview-token",
	appUrl: "https://carlnotes.com",
} satisfies TeamInviteEmailProps

// render the template to an HTML string for sending. the api calls this at send-email time
export function renderTeamInviteEmail(props: TeamInviteEmailProps): Promise<string> {
	return render(<TeamInviteEmail {...props} />)
}

// the same email as plain text, sent with the HTML so the message is not html-only.
// a message with no text part reads as machine-generated and goes to a spam filter.
// also, some clients and screen readers show this instead of HTML
export function renderTeamInviteEmailText(props: TeamInviteEmailProps): Promise<string> {
	return render(<TeamInviteEmail {...props} />, { plainText: true })
}
