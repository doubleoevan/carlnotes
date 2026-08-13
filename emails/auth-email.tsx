// the emails sent for one link: confirming an address, resetting a password, changing an address.
// one template for all of them, since they differ only in what they say and what the link is for.
// the topic invitation email reuses it too, through its own wrapper in topic-invite-email.tsx.
// authored as a react-email template like the scan emails, so it previews with `bun run dev:email`
import { Link, Section, Text } from "@react-email/components"
import { render } from "@react-email/render"
import type { CSSProperties, ReactElement, ReactNode } from "react"
import { EmailIntro, EmailShell } from "./topic-scan-email"

// what an auth email says. the link is the point, and everything else is one sentence around it
export type AuthEmailProps = {
	heading: string
	// the sentence under the heading, above the button. it always feeds the inbox preheader,
	// and renders in the body too, unless leadContent stands in for it there
	lead: string
	// the same sentence with markup: a link on a name, rendered in the body in place of lead.
	// the preheader stays on the plain lead, since an inbox renders no markup there
	leadContent?: ReactNode
	buttonLabel: string
	url: string
	// one more sentence about the link, read just before the note that ignoring it is safe.
	// omitted when there is nothing to add
	linkNote?: string
	// the optional closing reassurance, it says "didn't ask for this" if an invitation arrives unasked.
	closingNote?: string
	appUrl?: string
}

// the template. a heading, a sentence, a button, the url in full, and the note that ignoring it is safe
export default function AuthEmail({
	heading,
	lead,
	leadContent,
	buttonLabel,
	url,
	linkNote,
	closingNote,
	appUrl,
}: AuthEmailProps): ReactElement {
	return (
		<EmailShell preview={lead} appUrl={appUrl}>
			<EmailIntro heading={heading}>{leadContent ?? lead}</EmailIntro>
			<Section style={buttonSection}>
				<Link href={url} style={button}>
					{buttonLabel}
				</Link>
			</Section>
			{/* the same link in full, since some clients strip a styled anchor and some users want to see where it goes */}
			<Section style={fallbackSection}>
				<Text style={fallbackText}>Or paste this into your browser:</Text>
				<Link href={url} style={fallbackLink}>
					{url}
				</Link>
			</Section>
			<Section style={footerSection}>
				<Text style={footerText}>
					{linkNote ? `${linkNote} ` : ""}
					{closingNote ?? "If you didn't ask for this, you can ignore this email and nothing will change."}
				</Text>
			</Section>
		</EmailShell>
	)
}

// what `bun run dev:email` renders this template with. the confirm-your-email case, which is the one every new user sees.
// the other two differ only in their words.
AuthEmail.PreviewProps = {
	heading: "Confirm your email",
	lead: "Carl is ready to start reading for you. Confirm this address so he knows where to send what he finds.",
	buttonLabel: "Confirm your email",
	url: "https://carlnotes.com/api/auth/verify-email?token=preview&callbackURL=%2F",
	appUrl: "https://carlnotes.com",
} satisfies AuthEmailProps

// render the template to an HTML string for sending. the api calls this at send-email time
export function renderAuthEmail(props: AuthEmailProps): Promise<string> {
	return render(<AuthEmail {...props} />)
}

// the same email as plain text, sent with the HTML, so the message is not html-only.
// a message with no text part reads as machine-generated and goes to a spam filter.
// also, some clients and screen readers show this instead of HTML
export function renderAuthEmailText(props: AuthEmailProps): Promise<string> {
	return render(<AuthEmail {...props} />, { plainText: true })
}

// the coffee-toned palette the scan emails already use, so every CarlNotes email looks like the same sender
const buttonSection: CSSProperties = { padding: "8px 0 4px" }
const button: CSSProperties = {
	backgroundColor: "#f09050",
	borderRadius: "8px",
	color: "#2a1f14",
	display: "inline-block",
	fontSize: "16px",
	fontWeight: 600,
	padding: "12px 24px",
	textDecoration: "none",
}
const fallbackSection: CSSProperties = { padding: "12px 0 4px" }
const fallbackText: CSSProperties = { color: "#6b5b4a", fontSize: "13px", margin: "0 0 4px" }
const fallbackLink: CSSProperties = { color: "#7c4a1e", fontSize: "13px", wordBreak: "break-all" }
const footerSection: CSSProperties = { padding: "12px 0 24px" }
const footerText: CSSProperties = { color: "#6b5b4a", fontSize: "13px", margin: 0 }
