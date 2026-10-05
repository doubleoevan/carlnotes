// manual-scan email tests: the rendered HTML reports each outcome and names the scan's podcast episode,
// and the subject matches the body
import { expect, test } from "bun:test"
import { renderManualScanEmail, toManualScanSubject } from "./manual-scan-email"

// a successful manual scan lists its findings with the recap above them and doesn't offer an unsubscribe link
test("renderManualScanEmail lists a succeeded scan's findings under its recap", async () => {
	const html = await renderManualScanEmail({
		status: "succeeded",
		topicName: "LLM tooling",
		findings: [{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "covers agents" }],
		scanSummary: "Carl kept one thing.",
		topicUrl: "https://carlnotes.example.com/topics/abc",
	})

	// the recap, the finding, and the manual-trigger footer, with no subscription language
	expect(html).toContain("Carl kept one thing.")
	expect(html).toContain("https://a.com/1")
	expect(html).toContain("you started this brew yourself")
	expect(html).not.toContain("Unsubscribe")
})

// a manual scan with a podcast episode shows the podcast episode section
test("renderManualScanEmail shows the episode section with its title, link, cover, and description", async () => {
	// render a succeeded scan with a podcast episode that has a url and a cover
	const podcastEpisodeUrl = "https://carlnotes.example.com/topics/abc?episode=episode-1"
	const coverUrl = "https://carlnotes.example.com/api/podcast-covers/episode/episode-1/key-600.jpg"
	const html = await renderManualScanEmail({
		status: "succeeded",
		topicName: "LLM tooling",
		findings: [{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "covers agents" }],
		podcastEpisode: {
			title: "Evals grow up",
			description: "Carl and Vienna talk about three agents worth a query.",
			url: podcastEpisodeUrl,
			coverUrl,
		},
	})

	// the heading, the title, the description, and the cover. the title and the cover both link to the podcast episode
	expect(html).toContain("Coffee Break podcast with Carl and Vienna")
	expect(html).toContain("Evals grow up")
	expect(html).toContain("Episode summary")
	expect(html).toContain("Carl and Vienna talk about three agents worth a query.")
	expect(html).toContain(coverUrl)
	expect(html.split(`href="${podcastEpisodeUrl}"`).length - 1).toBe(2)
})

// a scan that found nothing still sends an email to the user waiting on the results
test("renderManualScanEmail reports a succeeded scan that found nothing", async () => {
	const html = await renderManualScanEmail({ status: "succeeded", topicName: "LLM tooling", findings: [] })
	expect(html).toContain("found nothing new worth your time")
	expect(html).toContain("Carl has high standards.")
})

// a failed scan reports why it stopped instead of a findings list and says that the scan is scheduled to retry
test("renderManualScanEmail reports a failed scan's reason", async () => {
	const html = await renderManualScanEmail({
		status: "failed",
		topicName: "LLM tooling",
		failureReason: "Carl hit this month's coffee budget.",
	})

	// matched without their apostrophes, which the renderer escapes to HTML entities
	expect(html).toContain("finish the brew you started")
	expect(html).toContain("Carl hit this month")
	expect(html).toContain("keep trying on this topic")
})

// the subject names the topic and follows the outcome, so the inbox line never contradicts the body
test("toManualScanSubject follows the scan outcome", () => {
	expect(toManualScanSubject({ status: "succeeded", topicName: "LLM tooling", findings: [] })).toBe(
		"Your brew of LLM tooling is ready",
	)
	expect(toManualScanSubject({ status: "failed", topicName: "LLM tooling", failureReason: "nope" })).toBe(
		"Your brew of LLM tooling didn't finish",
	)
})

// the summary line names the podcast episode only if the scan has a podcast episode
test("renderManualScanEmail names a new episode in its summary line if the scan has one", async () => {
	// a scan with a podcast episode names the podcast episode in its summary line
	const succeededScanEmailProps = {
		status: "succeeded" as const,
		topicName: "LLM tooling",
		findings: [{ title: "Agent news", url: "https://a.com/1", relevanceExplanation: "covers agents" }],
	}
	const podcastEpisodeEmailHtml = await renderManualScanEmail({
		...succeededScanEmailProps,
		podcastEpisode: { title: "Evals grow up" },
	})
	expect(podcastEpisodeEmailHtml).toContain("with 1 new finding worth your time and a new Coffee Break episode on ")

	// a scan with no podcast episode has the line without the podcast episode
	const noPodcastEpisodeEmailHtml = await renderManualScanEmail(succeededScanEmailProps)
	expect(noPodcastEpisodeEmailHtml).toContain("with 1 new finding worth your time on ")
	expect(noPodcastEpisodeEmailHtml).not.toContain("Coffee Break episode")
})
