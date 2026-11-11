// the topic prompt renders plain until it is long enough to need the scroll box, and the popover shows the latest
// podcast episode's film above its row only for a ready film
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicFeed } from "@carlnotes/contracts/topicFeedTestFixtures"
import { renderToStaticMarkup } from "react-dom/server"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { TopicInfo, TopicPrompt } from "./TopicInfo"

// the character count the component treats as long
const SCROLLING_PROMPT_CHARS = 900

// a prompt of a given length, in words so it wraps the way a written prompt does
const toPrompt = (length: number): string =>
	"Track indoor basketball leagues and open gym runs across the Peninsula. ".repeat(30).slice(0, length)

// a prompt that fits reads as its own paragraph, with no box drawn around it
test("a short prompt renders without the scroll box", () => {
	const html = renderToStaticMarkup(<TopicPrompt prompt={toPrompt(120)} allowedUrls={undefined} />)
	expect(html).toContain("Track indoor basketball leagues")
	expect(html).not.toContain("overflow-y-auto")
})

// past the limit, the prompt scrolls inside the box
test("a long prompt renders inside the scroll box", () => {
	const html = renderToStaticMarkup(<TopicPrompt prompt={toPrompt(1200)} allowedUrls={undefined} />)
	expect(html).toContain("overflow-y-auto")
	expect(html).toContain("max-h-72")

	// the highlight treatment is what makes the box readable as scrollable
	expect(html).toContain("scrollbar-highlight")
	expect(html).toContain("border-primary/50")
})

// the box appears only once the prompt passes the count, not at it
test("the scroll box starts past the prompt length limit", () => {
	const atLimit = renderToStaticMarkup(
		<TopicPrompt prompt={toPrompt(SCROLLING_PROMPT_CHARS)} allowedUrls={undefined} />,
	)
	const pastLimit = renderToStaticMarkup(
		<TopicPrompt prompt={toPrompt(SCROLLING_PROMPT_CHARS + 1)} allowedUrls={undefined} />,
	)
	expect(atLimit).not.toContain("overflow-y-auto")
	expect(pastLimit).toContain("overflow-y-auto")
})

// an empty prompt is a dash, the same placeholder every unset info line uses
test("a topic with no prompt shows a dash", () => {
	expect(renderToStaticMarkup(<TopicPrompt prompt={null} allowedUrls={undefined} />)).toBe("—")
})

// a ready film's section sits right above the podcast's, with the play button over the film's own poster
test("a latest podcast episode with a ready film shows the film above the podcast row", async () => {
	const latestPodcastEpisode = toPodcastEpisodeFixture({
		video: { videoUrl: "/film.mp4", captionsUrl: "/captions.vtt", posterUrl: "/poster.jpg" },
	})
	const html = await renderWithRouter(<TopicInfo topic={toTestTopicFeed({ latestPodcastEpisode })} />)
	expect(html).toContain("Coffee Break film<")
	expect(html.indexOf("Coffee Break film<")).toBeLessThan(html.indexOf("Coffee Break podcast<"))
	expect(html).toMatch(/aria-label="Play film"[^>]*><img src="\/poster\.jpg"/)

	// the film's row and the podcast's row each show the title and the details
	expect(html.match(/E7 · Robot vacuums, ranked/g)).toHaveLength(2)
	expect(html.match(/Oct 1 · 10 min · latest/g)).toHaveLength(2)
})

// a latest podcast episode with no film keeps its own row and shows no film section
test("a latest podcast episode with no ready film shows no film section", async () => {
	const audioOnlyTopic = toTestTopicFeed({ latestPodcastEpisode: toPodcastEpisodeFixture({ video: null }) })
	const audioOnlyHtml = await renderWithRouter(<TopicInfo topic={audioOnlyTopic} />)
	expect(audioOnlyHtml).toContain("Coffee Break podcast<")
	expect(audioOnlyHtml).not.toContain("Coffee Break film")
	expect(audioOnlyHtml).not.toContain('aria-label="Play film"')
})
