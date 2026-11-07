// notifications email tests: the subject's counts, the quote that is escaped, shortened, and never a link, the limit
// of ten quotes, and the links that all open CarlNotes
import { expect, test } from "bun:test"
import {
	type NotificationsEmailItem,
	renderNotificationsEmail,
	renderNotificationsEmailText,
	toNotificationsEmailSubject,
} from "./notifications-email"

// a comment by one user on one Topic, with the given words
function toCommentItem(text: string): NotificationsEmailItem {
	return {
		kind: "comment",
		authorUsername: "roastfan",
		reactionLabel: null,
		targetLabel: "Coffee",
		targetUrl: "https://carlnotes.com/topics/topic-1/coffee",
		text,
	}
}

test("the subject counts each kind that has any, a reaction to a hot take among the reactions", () => {
	const reactionItem: NotificationsEmailItem = {
		...toCommentItem("hot"),
		text: null,
		reactionLabel: "Like",
		kind: "reaction",
	}
	const commentReactionItem: NotificationsEmailItem = { ...reactionItem, kind: "commentReaction" }
	const replyItem: NotificationsEmailItem = { ...toCommentItem("same"), kind: "reply" }
	expect(
		toNotificationsEmailSubject({ items: [reactionItem, commentReactionItem, toCommentItem("a"), replyItem] }),
	).toBe("Carl left you a note: 1 hot take, 1 reply, 2 reactions")
	expect(toNotificationsEmailSubject({ items: [{ ...toCommentItem("hi"), kind: "mention" }] })).toBe(
		"Carl left you a note: 1 mention",
	)
})

test("each kind reads as what its author did", async () => {
	const text = await renderNotificationsEmailText({
		items: [
			{ ...toCommentItem("hot"), text: null, reactionLabel: "Like", kind: "reaction" },
			{ ...toCommentItem("hot"), text: null, reactionLabel: "Funny", kind: "commentReaction" },
			{ ...toCommentItem("same here"), kind: "reply" },
			{ ...toCommentItem("hey @owner"), kind: "mention" },
		],
	})
	expect(text).toContain("roastfan reacted Like to Coffee")
	expect(text).toContain("roastfan reacted Funny to your hot take on Coffee")
	expect(text).toContain("roastfan replied to your hot take on Coffee")
	expect(text).toContain("roastfan mentioned you on Coffee")
})

test("a url in a quote is not a link, and markup shows as text", async () => {
	const html = await renderNotificationsEmail({
		items: [toCommentItem('read <a href="https://evil.example.org">this</a> at evil.example.org')],
		appUrl: "https://carlnotes.com",
	})

	// the markup is escaped, the domain has bracketed dots, and every anchor opens CarlNotes
	expect(html).toContain("&lt;a href=")
	expect(html).toContain("evil[.]example[.]org")
	const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? "")
	expect(hrefs.length).toBeGreaterThan(0)
	expect(hrefs.every((href) => href.startsWith("https://carlnotes.com"))).toBe(true)
})

test("a long quote is cut to 140 characters", async () => {
	const html = await renderNotificationsEmail({ items: [toCommentItem("x".repeat(300))] })
	expect(html).toContain(`${"x".repeat(139)}…`)
	expect(html).not.toContain("x".repeat(140))
})

test("fourteen comments quote ten and count four more", async () => {
	const items = Array.from({ length: 14 }, (_unused, index) => toCommentItem(`comment number ${index + 1} here`))
	const text = await renderNotificationsEmailText({ items })
	expect(text).toContain("comment number 10 here")
	expect(text).not.toContain("comment number 11 here")
	expect(text).toContain("4 more are waiting.")
})

test("the email says its fixed lines and never what the reader missed", async () => {
	const text = await renderNotificationsEmailText({ items: [toCommentItem("hello")], unsubscribeUrl: "https://x" })
	expect(text).toContain("People had things to say about your topics. Carl wrote them down.")
	expect(text).toContain("Notes don't nag. Turn this email off anytime.")
	expect(text.toLowerCase()).not.toContain("missed")
})

test("the plain text unlinks a target's name", async () => {
	const text = await renderNotificationsEmailText({
		items: [{ ...toCommentItem("hi"), targetLabel: "evil.com review" }],
	})
	expect(text).toContain("evil[.]com review")
})
