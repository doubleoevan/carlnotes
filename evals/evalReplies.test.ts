// eval reply tests: the chat link check, the prose paragraphs, and the markdown markup
import { expect, test } from "bun:test"
import { toDisallowedLinkUrl, toLinkUrls, toMarkdownMarkup, toProseParagraphs } from "./evalReplies"

test("a chat reply may link a finding, the docs root, or a docs page that it was given, and nothing else", () => {
	// the finding and the docs block that the reply may link
	const findingUrls = ["https://burrnotes.example/quiet-burrs"]
	const docsBlock = "[carlnotes.com/docs/topics/adding-sources]\nPress Recommend in the source editor."

	// a finding, the docs root, and a docs page in the block, written with a scheme, a slash, or an anchor
	const allowedReplyText =
		"See [the burrs](https://burrnotes.example/quiet-burrs), [the docs](https://carlnotes.com/docs/), and [Recommend](https://www.carlnotes.com/docs/topics/adding-sources#let-carl-recommend-sources)."
	expect(toDisallowedLinkUrl({ replyText: allowedReplyText, findingUrls, docsBlock })).toBeUndefined()

	// a docs page that the chat was not given, and an outside page, are both disallowed
	const otherDocsReplyText = "Read [teams](https://carlnotes.com/docs/teams/teaming-up)."
	expect(toDisallowedLinkUrl({ replyText: otherDocsReplyText, findingUrls, docsBlock })).toBe(
		"https://carlnotes.com/docs/teams/teaming-up",
	)
	expect(toDisallowedLinkUrl({ replyText: "[deal](https://deals.example/x)", findingUrls, docsBlock })).toBe(
		"https://deals.example/x",
	)

	// a bare url and an autolink render as links too, so each url is disallowed
	expect(toDisallowedLinkUrl({ replyText: "More at https://deals.example/bare.", findingUrls, docsBlock })).toBe(
		"https://deals.example/bare",
	)
	expect(toDisallowedLinkUrl({ replyText: "More at <https://deals.example/auto>", findingUrls, docsBlock })).toBe(
		"https://deals.example/auto",
	)

	// a bare url and an inline link keep their balanced parentheses, and a closing parenthesis around the url is left out
	expect(toLinkUrls("[Coffee](https://en.wikipedia.org/wiki/Coffee_(drink)) is a drink.")).toEqual([
		"https://en.wikipedia.org/wiki/Coffee_(drink)",
	])
	expect(toLinkUrls("See https://en.wikipedia.org/wiki/URL_(disambiguation).")).toEqual([
		"https://en.wikipedia.org/wiki/URL_(disambiguation)",
	])
	expect(toLinkUrls("(see https://deals.example/x)")).toEqual(["https://deals.example/x"])

	// a bare www. address renders as a link too, with http
	expect(toLinkUrls("More at www.deals.example/www.")).toEqual(["http://www.deals.example/www"])

	// a url in inline code or a fenced code block never renders as a link
	expect(toLinkUrls("Run `curl https://deals.example/api` first.")).toEqual([])
	expect(toLinkUrls("```\ncurl https://deals.example/api\n```\nSee https://deals.example/x")).toEqual([
		"https://deals.example/x",
	])
})

test("a reply's prose paragraphs leave out its lists and its lone headings", () => {
	// a reply with a paragraph, a bold heading, a list, a markdown heading, and a closing paragraph
	const replyText = [
		"The quiet burrs are the pick.",
		"**Home roasting**",
		"- the smoke filter\n- the cooling tray",
		"## Water",
		"Soft water sours the shot.",
	].join("\n\n")
	expect(toProseParagraphs(replyText)).toEqual(["The quiet burrs are the pick.", "Soft water sours the shot."])
})

test("a reply's first markdown markup is named, and a reply of plain sentences has none", () => {
	// plain sentences, with a price and bold words, have no markup that a check names
	expect(toMarkdownMarkup("Yes. The quiet burrs are the pick, and they ship in March for $89.")).toBeUndefined()
	expect(toMarkdownMarkup("The **quiet burrs** are the pick.")).toBeUndefined()

	// a heading, a list, a table, fenced code, and a link are each named
	expect(toMarkdownMarkup("## Water\n\nSoft water sours the shot.")).toBe("a heading")
	expect(toMarkdownMarkup("Two things:\n\n- the smoke filter\n- the cooling tray")).toBe("a list")
	expect(toMarkdownMarkup("1. grind\n2. tamp")).toBe("a list")
	expect(toMarkdownMarkup("| burrs | price |\n| --- | --- |")).toBe("a table")
	expect(toMarkdownMarkup("```\ncurl https://deals.example/api\n```")).toBe("fenced code")
	expect(toMarkdownMarkup("See [the burrs](https://burrnotes.example/quiet-burrs).")).toBe("a link")
	expect(toMarkdownMarkup("More at https://deals.example/bare.")).toBe("a link")
})
