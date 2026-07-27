// the one-click unsubscribe target for the topic-scan email. the token in the link is the auth: it is verified, the
// recipient's direct subscription is deleted, and the topic is looked up so the confirmation page can name it and link to it
import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { subscriptions, topics } from "../db/schema"
import { verifyUnsubscribeToken } from "../worker"

/**
 * Verifies the token, deletes the recipient's direct subscription, and returns the unsubscribed topic (null when the token is bad).
 */
export async function unsubscribe(unsubscribeToken: string | undefined): Promise<{ id: string; name: string } | null> {
	// a missing or forged token unsubscribes nothing
	const unsubscribePayload = unsubscribeToken ? await verifyUnsubscribeToken(unsubscribeToken) : null
	if (!unsubscribePayload) {
		return null
	}

	// delete the user's direct subscription. an audience-only subscriber has no direct row, so this doesn't reach them
	await db
		.delete(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, unsubscribePayload.topicId),
				eq(subscriptions.subscriberUserId, unsubscribePayload.userId),
			),
		)

	// the topic id and name for the confirmation page, falling back when the topic has since been deleted
	const [topic] = await db.select({ name: topics.name }).from(topics).where(eq(topics.id, unsubscribePayload.topicId))
	return { id: unsubscribePayload.topicId, name: topic?.name ?? "that topic" }
}

/**
 * The confirmation page shown after a successful unsubscribe, coffee-toned to match the email.
 */
export function unsubscribedPage(topic: { id: string; name: string }, appUrl?: string): string {
	// link straight to the topic so the reader can still drop by for new notes
	const topicUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/topics/${topic.id}` : undefined
	return renderPage(`
		<h1>You're unsubscribed</h1>
		<p>No more emails about <strong>${Bun.escapeHTML(topic.name)}</strong>. Carl will read quietly.</p>
		${backLink(topicUrl, "Drop by on your own for the latest notes")}
	`)
}

/**
 * The page shown when the unsubscribe token is missing, forged, or expired.
 */
export function invalidUnsubscribePage(appUrl?: string): string {
	return renderPage(`
		<h1>This link didn't work</h1>
		<p>The unsubscribe link is invalid or has expired. You can manage your subscriptions in the app.</p>
		${backLink(appUrl, "Open CarlNotes")}
	`)
}

// a link to the url with the given label, rendered only when the url is known. escaped so a topic name or url can't break the markup
function backLink(url: string | undefined, label: string): string {
	return url ? `<p class="back"><a href="${Bun.escapeHTML(url)}">${Bun.escapeHTML(label)}</a></p>` : ""
}

// TODO: redirect to a page in the app instead. this palette is a third copy of one already in the ui and the email template
// the served page's css: a centered, coffee-toned card
const PAGE_STYLE = `
	body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
	       background:#f4f1ea; color:#2b2b2b; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif }

	.card { background:#fff; border:1px solid #ece7de; border-radius:14px;
	        max-width:440px; margin:24px; padding:32px 36px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.06) }

	.mark { color:#7c4a1e; font-size:15px; font-weight:700; margin-bottom:20px }
	h1    { font-size:22px; margin:0 0 10px }
	p     { color:#5b5b5b; font-size:15px; line-height:1.55; margin:0 0 8px }
	.back { margin-top:20px }
	a     { color:#7c4a1e }
`

// a served web page can use a style block, unlike an email. the card carries the CarlNotes mark and the page content
function renderPage(cardContent: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CarlNotes</title><style>${PAGE_STYLE}</style></head><body><div class="card"><div class="mark">☕ CarlNotes</div>${cardContent}</div></body></html>`
}
