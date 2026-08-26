// preview tag tests: a route replaces the shell tags it writes and keeps the site-wide defaults it doesn't
import { expect, test } from "bun:test"
import { toShellWithHeadTags, toTeamPreviewHtml } from "./preview"

// a shell with the site-wide preview card, which is what a page that sets no preview of its own should keep
const APP_SHELL = [
	"<html><head>",
	"<title>CarlNotes — He already read it. All of it.</title>",
	'<link rel="canonical" href="https://carlnotes.com">',
	'<meta property="og:type" content="website">',
	'<meta property="og:title" content="CarlNotes — He already read it. All of it.">',
	'<meta property="og:description" content="Carl keeps up with your topics.">',
	'<meta property="og:image" content="https://carlnotes.com/opengraph-image.png">',
	'<meta name="twitter:card" content="summary_large_image">',
	'<meta name="twitter:image" content="https://carlnotes.com/opengraph-image.png">',
	"</head><body><div id=root></div></body></html>",
].join("")

// the homepage and the plain SPA pages set a title and a canonical url and nothing else
test("toShellWithHeadTags keeps the default preview card when a route writes no preview tags", () => {
	const served = toShellWithHeadTags(
		APP_SHELL,
		'<title>Plans — CarlNotes</title><link rel="canonical" href="https://carlnotes.com/plans">',
	)

	// the shell's own card survives untouched
	expect(served).toContain('content="https://carlnotes.com/opengraph-image.png"')
	expect(served).toContain('property="og:title"')
	expect(served).toContain('property="og:description"')
	expect(served).toContain('name="twitter:card"')

	// the route's title and canonical replace the shell's instead of joining them
	expect(served).toContain("<title>Plans — CarlNotes</title>")
	expect(served.match(/<title>/g)).toHaveLength(1)
	expect(served).toContain('href="https://carlnotes.com/plans"')
	expect(served.match(/rel="canonical"/g)).toHaveLength(1)
})

// a topic writes its own card, and every tag it names has to appear exactly once
test("toShellWithHeadTags replaces only the tags a route writes", () => {
	const topicTags = [
		"<title>Agents — CarlNotes</title>",
		'<meta property="og:title" content="Agents">',
		'<meta property="og:image" content="https://carlnotes.com/api/topics/t1/preview.png">',
		'<meta name="twitter:image" content="https://carlnotes.com/api/topics/t1/preview.png">',
	].join("")
	const served = toShellWithHeadTags(APP_SHELL, topicTags)

	// the topic's own image wins, and the shell's image is gone, with one tag of each kind left
	expect(served).toContain("/api/topics/t1/preview.png")
	expect(served).not.toContain("opengraph-image.png")
	expect(served.match(/property="og:image"/g)).toHaveLength(1)
	expect(served.match(/property="og:title"/g)).toHaveLength(1)
	expect(served.match(/name="twitter:image"/g)).toHaveLength(1)

	// a tag the topic never writes keeps the shell's value
	expect(served).toContain('property="og:description"')
	expect(served).toContain('property="og:type"')
})

// body tags are placed inside the body element, ahead of the SPA root
test("toShellWithHeadTags puts body tags after the opening body tag", () => {
	const served = toShellWithHeadTags(APP_SHELL, "<title>Agents</title>", "<noscript>findings</noscript>")
	expect(served).toContain("<body><noscript>findings</noscript>")
})

// a team's head tags include its own card, name, and canonical url
test("toTeamPreviewHtml writes the team's tags over the shell's", () => {
	const html = toTeamPreviewHtml(
		APP_SHELL,
		{ teamId: "tm1", name: "Raccoon Crew", avatar: null, memberCount: 1, topicCount: 3 },
		"https://carlnotes.com",
	)

	// the card, the canonical url, and the counts the description reads
	expect(html).toContain('<meta property="og:image" content="https://carlnotes.com/api/teams/tm1/preview.png">')
	expect(html).toContain('<link rel="canonical" href="https://carlnotes.com/teams/tm1">')
	expect(html).toContain("1 member, 3 public topics.")
	// one of each tag, so the shell's defaults never sit beside the team's
	expect(html.match(/<meta property="og:title"/g)).toHaveLength(1)
})
