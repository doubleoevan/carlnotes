// the links a reply renders: the words that name the new-topic chat become a button,
// and a model-written href is a live link only when its scheme is web
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatMarkdown, isSafeHref, toNewTopicChatLinkedMarkdown } from "./ChatMarkdown"

test("the words that name the new-topic chat are linked, bold and quoted or plain", () => {
	expect(toNewTopicChatLinkedMarkdown('Open the switcher and tap **"Give Carl a topic. You know the one."**')).toBe(
		'Open the switcher and tap **"[Give Carl a topic. You know the one.](#new-topic-chat)"**',
	)
	expect(toNewTopicChatLinkedMarkdown("Give Carl a topic. You know the one. Then we build it.")).toContain(
		"[Give Carl a topic. You know the one.](#new-topic-chat)",
	)
})

test("text without the words is left alone", () => {
	expect(toNewTopicChatLinkedMarkdown("Give Carl a source and he reads it.")).toBe(
		"Give Carl a source and he reads it.",
	)
})

// the linked words open a chat instead of going to a url, so they render as a button
test("the linked words render as a button and a web link still renders as a link", () => {
	const chatWordsHtml = renderToStaticMarkup(<ChatMarkdown markdown="Tap Give Carl a topic. You know the one." />)
	expect(chatWordsHtml).toContain("<button")
	expect(chatWordsHtml).not.toContain("#new-topic-chat")
	const webLinkHtml = renderToStaticMarkup(<ChatMarkdown markdown="[the docs](https://carlnotes.com/docs)" />)
	expect(webLinkHtml).toContain('href="https://carlnotes.com/docs"')
})

// http and https render as live links
test("web schemes are safe", () => {
	expect(isSafeHref("https://example.com/post")).toBe(true)
	expect(isSafeHref("http://example.com")).toBe(true)
})

// every other scheme renders as plain text and never a clickable link
test("script and data schemes are rejected", () => {
	expect(isSafeHref("javascript:alert(1)")).toBe(false)
	// biome-ignore lint/suspicious/noTemplateCurlyInString: a literal attack string, not an interpolation
	expect(isSafeHref("data:text/html,<script>${'x'}</script>")).toBe(false)
	expect(isSafeHref("vbscript:msgbox")).toBe(false)
	expect(isSafeHref("file:///etc/passwd")).toBe(false)
	expect(isSafeHref(undefined)).toBe(false)
	expect(isSafeHref("")).toBe(false)
})
