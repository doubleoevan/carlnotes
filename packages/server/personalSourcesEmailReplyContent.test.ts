// synthetic reply alternatives exercise extraction without reading or sending mail
import { expect, test } from "bun:test"
import { normalizePersonalSourcesEmail } from "./personalSourcesEmailContent"
import { toPersonalSourcesEmailReplyContent } from "./personalSourcesEmailReplyContent"
import { personalSourcesEmailFixture } from "./personalSourcesEmailTestFixtures"

test("quoted digest links do not turn thanks into a send in common mail formats", () => {
	const alternatives = [
		{ text: "Thanks\n> https://example.org/old" },
		{ text: "Thanks\nOn Monday, Carl\n<notes@example.com> wrote:\nhttps://example.org/old" },
		{ text: "Thanks\n-----Original Message-----\nhttps://example.org/old" },
		{ text: "Thanks\nFrom: Carl\nSent: Monday\nTo: Reader\nSubject: Digest\nhttps://example.org/old" },
		{ text: null, html: '<p>Thanks</p><blockquote><a href="https://example.org/old">Old</a></blockquote>' },
		{ text: null, html: '<p>Thanks</p><div class="gmail_quote"><a href="https://example.org/old">Old</a></div>' },
		{
			text: "Thanks\nOld digest https://example.org/old",
			html: '<p>Thanks</p><div class="gmail_quote"><blockquote>Old digest <a href="https://example.org/old">Old</a></blockquote></div>',
		},
		{
			text: null,
			html: '<p>Thanks</p><div id="divRplyFwdMsg">From: Carl</div><a href="https://example.org/old">Old</a>',
		},
	]
	for (const content of alternatives) {
		const extracted = toPersonalSourcesEmailReplyContent(
			personalSourcesEmailFixture({
				...content,
				headers: { "In-Reply-To": "<digest@example.com>" },
			}),
		)
		const { payload } = normalizePersonalSourcesEmail({
			email: extracted.email,
			ownerEmail: "owner@example.com",
			isOwnerEmailVerified: true,
		})
		expect(extracted.isReply).toBe(true)
		expect(payload.links).toEqual([])
		expect(payload.text).toBe("Thanks")
	}
})

test("new HTML links survive while quoted links and text stay excluded", () => {
	const { email } = toPersonalSourcesEmailReplyContent(
		personalSourcesEmailFixture({
			subject: "Re: A digest",
			text: "Read this https://example.org/new\nOld digest https://example.org/old",
			html: '<p>Read <a href="https://example.org/new">this</a></p><blockquote><a href="https://example.org/old">old</a></blockquote>',
		}),
	)
	const { payload } = normalizePersonalSourcesEmail({
		email,
		ownerEmail: "owner@example.com",
		isOwnerEmailVerified: true,
	})
	expect(payload.links).toEqual(["https://example.org/new"])
	expect(payload.text).not.toContain("old")
})

test("explicit forwards preserve the original message even with copied thread headers", () => {
	const original = personalSourcesEmailFixture({
		subject: "Fwd: Newsletter",
		text: "> https://example.org/article",
		headers: { References: "<newsletter@example.com>" },
	})
	expect(toPersonalSourcesEmailReplyContent(original)).toEqual({ email: original, isReply: false })
})

test("rich replies keep the first-line Topic hint separate from authored content", () => {
	// the plain alternative contains unmarked history that the HTML still identifies
	const { email } = toPersonalSourcesEmailReplyContent(
		personalSourcesEmailFixture({
			subject: "Re: Digest",
			text: "topic: Moss\nKeep the terrarium moist.\nOld digest https://example.org/old",
			html: '<p>topic: Moss</p><p>Keep the terrarium moist.<br>Read <a href="https://example.org/new">this</a>.</p><blockquote>Old digest https://example.org/old</blockquote>',
		}),
	)
	const { payload } = normalizePersonalSourcesEmail({
		email,
		ownerEmail: "owner@example.com",
		isOwnerEmailVerified: true,
	})
	expect(payload.text).toBe("topic: Moss\nKeep the terrarium moist.\nRead this .")
	expect(payload.links).toEqual(["https://example.org/new"])
})

test("reply detection supports References and Re subjects without trusting copied body headers", () => {
	for (const content of [{ headers: { References: "<digest@example.com>" } }, { subject: "Re: Digest" }]) {
		expect(toPersonalSourcesEmailReplyContent(personalSourcesEmailFixture(content)).isReply).toBe(true)
	}
	expect(
		toPersonalSourcesEmailReplyContent(personalSourcesEmailFixture({ text: "In-Reply-To: <digest@example.com>" }))
			.isReply,
	).toBe(false)
})
