// topic-scan email tests: the rendered HTML lists each finding, numbered, links it, escapes finding text,
// and shows the scan's podcast episode
import { expect, test } from "bun:test"
import { renderTopicScanEmail } from "./topic-scan-email"

// the render lists each new Finding with its link and note, falling back to the url when a title is missing, and escapes HTML
test("renderTopicScanEmail lists findings, links them, and escapes text", async () => {
	// two findings: one with a note, one with a null title that falls back to its url
	const html = await renderTopicScanEmail({
		topicName: "LLM tooling",
		findingCount: 3,
		findings: [
			{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "covers <agents> & tools" },
			{ title: null, url: "https://b.com/2", relevanceExplanation: "" },
		],
	})

	// the topic name, both links, the null-title url fallback, and escaped html-significant characters
	expect(html).toContain("LLM tooling")
	expect(html).toContain("https://a.com/1")
	expect(html).toContain("https://b.com/2")
	expect(html).toContain("&lt;agents&gt;")
})

// the host under each title is written as a link, so a mail client cannot linkify the bare domain into a
// link to that domain's front page
test("renderTopicScanEmail links the host at the finding, not at its domain", async () => {
	const html = await renderTopicScanEmail({
		topicName: "Engineer jobs",
		findingCount: 1,
		findings: [{ title: "Full Stack", url: "https://jobs.ashbyhq.com/fireworks/123", relevanceExplanation: "" }],
	})

	// the host text sits inside an anchor, and that anchor points at the finding rather than the domain root
	const hostLink = html.match(/<a[^>]*href="([^"]*)"[^>]*>\s*jobs\.ashbyhq\.com\s*<\/a>/)
	expect(hostLink?.[1]).toBe("https://jobs.ashbyhq.com/fireworks/123")
})

// a scan that kept nothing still sends, with Carl's aside standing in for the missing findings list
test("renderTopicScanEmail reports a scan that kept nothing new", async () => {
	const html = await renderTopicScanEmail({ topicName: "LLM tooling", findingCount: 0, findings: [] })

	expect(html).toContain("found nothing new worth your time")
	expect(html).toContain("Carl has high standards.")
})

// each card is numbered by its position in the findings array, the order the caller's query already ranked them in
test("renderTopicScanEmail numbers each finding by its array position", async () => {
	const html = await renderTopicScanEmail({
		topicName: "LLM tooling",
		findingCount: 2,
		findings: [
			{ title: "First", url: "https://a.com/1", relevanceExplanation: "" },
			{ title: "Second", url: "https://b.com/2", relevanceExplanation: "" },
		],
	})

	// split on the number span's unique style, so each segment starts right after one card's number opens.
	// splitting instead of a strict tag-adjacency regex tolerates however the renderer spaces the markup
	const cards = html.split('font-weight:400">').slice(1)
	expect(cards).toHaveLength(2)
	const [firstCard, secondCard] = cards as [string, string]
	expect(firstCard.startsWith("1")).toBe(true)
	expect(firstCard).toContain("First")
	expect(secondCard.startsWith("2")).toBe(true)
	expect(secondCard).toContain("Second")
})

// the recap renders through a limited Markdown subset. formatting survives, but a link only works when it points
// at one of this email's own Finding urls. everything else, the relevance explanation included, stays plain text
test("renderTopicScanEmail renders the recap with formatting and only kept-finding links", async () => {
	// a recap citing the kept finding and an attacker's url, plus raw html, an image, and a note smuggling a link
	const html = await renderTopicScanEmail({
		topicName: "LLM tooling",
		findingCount: 1,
		findings: [{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "see [here](https://evil.test)" }],
		scanSummary:
			'**The numbers:** 3 kept.\n\nSources: [the agent piece](https://a.com/1) and [click me](https://evil.test)\n\n<a href="https://evil.test">or here</a> <img src="x">',
	})

	// the allowed formatting renders as real markup
	expect(html).toContain("<strong")

	// the kept finding's citation is a real anchor, which the finding card below links to
	expect(html).toContain("the agent piece</a>")

	// the attacker's link keeps its label, shows its destination as text, and no anchor points at it
	expect(html).toContain("click me")
	expect(html).toContain("(https://evil.test)")
	expect(html).not.toContain('href="https://evil.test"')

	// raw HTML reads as the characters the model typed, and no image tag is produced
	expect(html).toContain("&lt;a href=")
	expect(html).not.toContain("<img")

	// the relevance explanation is plain text, so its link syntax stays literal
	expect(html).toContain("[here](https://evil.test)")
})

// a scan with a podcast episode shows the podcast episode section
test("renderTopicScanEmail shows the episode section with its title, link, and cover", async () => {
	// render a scan email with a podcast episode that has a url and a cover
	const podcastEpisodeUrl = "https://carlnotes.example.com/topics/abc?episode=episode-1"
	const coverUrl = "https://carlnotes.example.com/api/podcast-covers/episode/episode-1/key-600.jpg"
	const html = await renderTopicScanEmail({
		topicName: "LLM tooling",
		findingCount: 0,
		findings: [],
		podcastEpisode: { title: "Evals <finally> grow up", url: podcastEpisodeUrl, coverUrl },
	})

	// the heading, the title line with the title escaped, and the cover at email width.
	// the title and the cover both link to the podcast episode
	expect(html).toContain("Coffee Break podcast with Carl and Vienna")
	expect(html).toContain("Today&#x27;s episode: ")
	expect(html).toContain("Evals &lt;finally&gt; grow up")
	expect(html.split(`href="${podcastEpisodeUrl}"`).length - 1).toBe(2)
	expect(html).toMatch(
		new RegExp(`<img[^>]*src="${coverUrl}"[^>]*width="600"|<img[^>]*width="600"[^>]*src="${coverUrl}"`),
	)
})

// a scan with no podcast episode sends its email without the podcast episode section
test("renderTopicScanEmail has no episode section for a scan with no episode", async () => {
	// render a scan email with no podcast episode
	const html = await renderTopicScanEmail({ topicName: "LLM tooling", findingCount: 0, findings: [] })
	expect(html).not.toContain("Coffee Break podcast")
})

// the summary line names the podcast episode only if the scan has a podcast episode
test("renderTopicScanEmail names a new episode in its summary line if the scan has one", async () => {
	// a scan with findings and a podcast episode names the podcast episode in its summary line
	const topicScanEmailProps = {
		topicName: "LLM tooling",
		findingCount: 2,
		findings: [
			{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "covers agents" },
			{ title: "Eval news", url: "https://a.com/2", relevanceExplanation: "covers evals" },
		],
	}
	const podcastEpisodeEmailHtml = await renderTopicScanEmail({
		...topicScanEmailProps,
		podcastEpisode: { title: "Evals grow up" },
	})
	expect(podcastEpisodeEmailHtml).toContain("2 new findings worth your time and a new Coffee Break episode on ")

	// a scan with no podcast episode has the line without the podcast episode
	const noPodcastEpisodeEmailHtml = await renderTopicScanEmail(topicScanEmailProps)
	expect(noPodcastEpisodeEmailHtml).toContain("2 new findings worth your time on ")
	expect(noPodcastEpisodeEmailHtml).not.toContain("Coffee Break episode")
})
