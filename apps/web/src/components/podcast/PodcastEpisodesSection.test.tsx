// the episode page's tables of podcast episodes: five rows a page with JavaScript, the first fifty without it, sortable
// title and description columns, a play button on every row, a card that ends at the last row of a one-page table,
// and nothing at all with no rows
import { expect, test } from "bun:test"
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeSummaryFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { NO_SCRIPT_ROW_LIMIT } from "@carlnotes/contracts/seo"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { toElementClassNames } from "@/components/markupTestFixtures"
import { SCRIPTED_HIDDEN_CLASS } from "@/lib/styleClasses"
import { PodcastEpisodesSection } from "./PodcastEpisodesSection"

// a published podcast episode of a public topic as the tables show it, with its description, numbered
function toPodcastEpisodeSummary(episodeNumber: number): PodcastEpisodeSummary {
	return toPodcastEpisodeSummaryFixture({
		id: `episode-${episodeNumber}`,
		title: `Episode title ${episodeNumber}`,
		description: `Episode description ${episodeNumber}`,
		episodeNumber,
		pagePath: `/topics/topic-1/agents/episodes/2026/${episodeNumber}`,
	})
}

// the start of the classes of a card that ends at its last row, and the class that keeps a paginated card's space
// with JavaScript, neither of which the markup escapes
const ONE_PAGE_CARD_MARKER = "overflow-hidden pb-0"
const SCRIPTED_PAGINATION_CARD_MARKER = "scripted:pb-4"

test("sixty episodes render the first fifty rows, five visible with JavaScript", async () => {
	const podcastEpisodes = Array.from({ length: 60 }, (_, i) => toPodcastEpisodeSummary(i + 1))
	const html = await renderWithRouter(
		<PodcastEpisodesSection
			value="episodes"
			title="Other episodes"
			titleColumnLabel="Episode"
			podcastEpisodes={podcastEpisodes}
		/>,
	)

	// the table body only, so the header row is not counted
	const tableBodyHtml = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"))

	// fifty rows, the first five shown and the rest hidden once JavaScript runs
	const rowClassNames = toElementClassNames(tableBodyHtml, "tr")
	expect(rowClassNames).toHaveLength(NO_SCRIPT_ROW_LIMIT)
	expect(rowClassNames.slice(0, 5).some((rowClassName) => rowClassName.includes(SCRIPTED_HIDDEN_CLASS))).toBe(false)
	expect(rowClassNames.slice(5).every((rowClassName) => rowClassName.includes(SCRIPTED_HIDDEN_CLASS))).toBe(true)

	// each title links to its page with a play button, and the fifty-first episode is left out
	expect(html).toContain('href="/topics/topic-1/agents/episodes/2026/1"')
	expect(html).toContain('aria-label="Play episode 50"')
	expect(html).not.toContain("Episode title 51")
	expect(html).toContain("Episode description 1")

	// both columns sort, and the card ends at its last row without JavaScript and keeps space for the pagination with it
	expect(html.match(/<th[^>]*><button type="button"/g)).toHaveLength(2)
	expect(html).toContain(ONE_PAGE_CARD_MARKER)
	expect(html).toContain(SCRIPTED_PAGINATION_CARD_MARKER)
})

test("a table of one page ends its card at the last row", async () => {
	const html = await renderWithRouter(
		<PodcastEpisodesSection
			value="related-episodes"
			title="Similar podcasts"
			titleColumnLabel="Podcast"
			podcastEpisodes={[toPodcastEpisodeSummary(1), toPodcastEpisodeSummary(2)]}
		/>,
	)
	expect(html).toContain("Similar podcasts")
	expect(html).toContain(">Podcast<")
	expect(html).toContain("Episode description 2")
	expect(html).toContain(ONE_PAGE_CARD_MARKER)
	expect(html).not.toContain(SCRIPTED_PAGINATION_CARD_MARKER)
})

test("a section with no episodes renders nothing", async () => {
	const html = await renderWithRouter(
		<PodcastEpisodesSection value="episodes" title="Other episodes" titleColumnLabel="Episode" podcastEpisodes={[]} />,
	)
	expect(html).not.toContain("Other episodes")
	expect(html).not.toContain("<table")
})
