// the notifications email: how other people reacted to and what they wrote on a user's Topics, Findings, Podcast
// Episodes, and comments, and where they were mentioned, in one email a day. a template with fixed lines and no model
// call
import { SITE_URL } from "@carlnotes/contracts/site"
import { Section, Text } from "@react-email/components"
import { render } from "@react-email/render"
import type { CSSProperties, ReactElement } from "react"
import { bodyText, EmailFooter, EmailIntro, EmailShell, LinkOrText, summaryLink } from "./emailShell"
import { summaryCard } from "./topic-scan-email"
import { toEmailQuote, toUnlinkedText } from "./unlinkedText"

// how many texts one email quotes, and how long a quote runs. the email counts whatever it does not quote
const NOTIFICATIONS_EMAIL_MAX_QUOTES = 10
const NOTIFICATIONS_EMAIL_QUOTE_CHARS = 140

// one thing that happened: who did it, what they did, on what, and their words if they wrote any. a reaction is on
// one of the recipient's things, a comment reaction on one of their comments, and a reply answers one of their comments
export type NotificationsEmailItem = {
	kind: "reaction" | "commentReaction" | "comment" | "reply" | "mention"
	authorUsername: string
	// the reaction's type as its label reads, null for a comment, a reply, and a mention
	reactionLabel: string | null
	// what it is on, by name, and that page's url if the app's url is known
	targetLabel: string
	targetUrl?: string
	// the words as written. the template escapes, shortens, and unlinks them
	text: string | null
}

// everything one email says: the items newest first, and the links back into the app
export type NotificationsEmailProps = {
	items: NotificationsEmailItem[]
	appUrl?: string
	unsubscribeUrl?: string
}

/**
 * Returns the email's subject line: how many hot takes, replies, reactions, and mentions wait, each only if it has
 * any.
 */
export function toNotificationsEmailSubject({ items }: NotificationsEmailProps): string {
	const toCountLabel = (kinds: NotificationsEmailItem["kind"][], singular: string, plural: string): string[] => {
		const count = items.filter((item) => kinds.includes(item.kind)).length
		return count > 0 ? [`${count} ${count === 1 ? singular : plural}`] : []
	}
	const countLabels = [
		...toCountLabel(["comment"], "hot take", "hot takes"),
		...toCountLabel(["reply"], "reply", "replies"),
		...toCountLabel(["reaction", "commentReaction"], "reaction", "reactions"),
		...toCountLabel(["mention"], "mention", "mentions"),
	]
	return `Carl left you a note: ${countLabels.join(", ")}`
}

// what an item's author did, as the words between their name and the target's name
function toItemAction({ kind, reactionLabel }: NotificationsEmailItem): string {
	if (kind === "mention") {
		return " mentioned you on "
	}
	if (kind === "comment") {
		return " left a hot take on "
	}
	if (kind === "reply") {
		return " replied to your hot take on "
	}

	// a reaction names its type, and one on the recipient's own comment says so
	return kind === "commentReaction" ? ` reacted ${reactionLabel} to your hot take on ` : ` reacted ${reactionLabel} to `
}

// the template. the brand header, each quoted item, the count of the remainder, and the way to turn the email off
export default function NotificationsEmail(props: NotificationsEmailProps): ReactElement {
	const { items, appUrl, unsubscribeUrl } = props
	const quotedItems = items.slice(0, NOTIFICATIONS_EMAIL_MAX_QUOTES)
	const moreCount = items.length - quotedItems.length
	return (
		<EmailShell preview={toNotificationsEmailSubject(props)} appUrl={appUrl}>
			<EmailIntro heading="Carl left you a note">
				People had things to say about your topics. Carl wrote them down.
			</EmailIntro>

			{/* each item: who did what on what, and their words in a quote that no mail client links */}
			{quotedItems.map((item, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: the items are a fixed list rendered once
				<Section key={index} style={summaryCard}>
					<Text style={itemLine}>
						<strong>{item.authorUsername}</strong>
						{toItemAction(item)}
						<LinkOrText href={item.targetUrl} style={summaryLink}>
							{item.targetLabel}
						</LinkOrText>
					</Text>
					{item.text ? <Text style={quoteText}>{toEmailQuote(item.text, NOTIFICATIONS_EMAIL_QUOTE_CHARS)}</Text> : null}
				</Section>
			))}

			{/* what the email did not quote, as a count */}
			{moreCount > 0 ? (
				<Text style={moreText}>{moreCount === 1 ? "One more is waiting." : `${moreCount} more are waiting.`}</Text>
			) : null}

			<EmailFooter unsubscribeUrl={unsubscribeUrl}>{"Notes don't nag. Turn this email off anytime."}</EmailFooter>
		</EmailShell>
	)
}

// who did what, the quote under it, and the count of what was not quoted
const itemLine: CSSProperties = { ...bodyText, margin: "0" }
const quoteText: CSSProperties = { ...bodyText, fontStyle: "italic", margin: "6px 0 0" }
const moreText: CSSProperties = { ...bodyText, margin: "16px 0 0" }

// what `bun run dev:email` renders this template with
NotificationsEmail.PreviewProps = {
	items: [
		{
			kind: "reaction",
			authorUsername: "roastfan",
			reactionLabel: "Insightful",
			targetLabel: "Why light roasts taste brighter",
			targetUrl: `${SITE_URL}/topics/topic-1/coffee?finding=finding-1`,
			text: null,
		},
		{
			kind: "reply",
			authorUsername: "roastfan",
			reactionLabel: null,
			targetLabel: "Why light roasts taste brighter",
			targetUrl: `${SITE_URL}/topics/topic-1/coffee?finding=finding-1`,
			text: "This finally explains the acidity. Worth the read.",
		},
		{
			kind: "comment",
			authorUsername: "vienna",
			reactionLabel: null,
			targetLabel: "Episode 3: The grind",
			targetUrl: `${SITE_URL}/topics/topic-1/coffee/episodes/2026/3`,
			text: "The chapter on burr grinders was my favorite. More at example.org/grinders",
		},
		{
			kind: "commentReaction",
			authorUsername: "latte",
			reactionLabel: "Like",
			targetLabel: "Coffee",
			targetUrl: `${SITE_URL}/topics/topic-1/coffee`,
			text: null,
		},
	],
	appUrl: SITE_URL,
	unsubscribeUrl: `${SITE_URL}/api/unsubscribe?token=preview`,
} satisfies NotificationsEmailProps

// render the template to an HTML string for sending
export function renderNotificationsEmail(props: NotificationsEmailProps): Promise<string> {
	return render(<NotificationsEmail {...props} />)
}

// the same email as plain text, where no anchor wraps a target's name, so each name is unlinked too
export function renderNotificationsEmailText(props: NotificationsEmailProps): Promise<string> {
	const unlinkedItems = props.items.map((item) => ({ ...item, targetLabel: toUnlinkedText(item.targetLabel) }))
	return render(<NotificationsEmail {...props} items={unlinkedItems} />, { plainText: true })
}
