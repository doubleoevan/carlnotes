import { expect, test } from "bun:test"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import {
	PodcastEpisodesCard,
	type PodcastEpisodesCardElements,
	toShownPodcastEpisodeId,
	toShownPodcastSeason,
} from "@carlnotes/core/components/PodcastEpisodesCard"
import { toPodcastEpisodeFixture } from "@carlnotes/core/lib/podcastEpisodeTestFixtures"
import { act, type ComponentProps } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

// capture the controls rendered by the shared composition without replacing its state
const episodes = Array.from({ length: 8 }, (_, index) =>
	toPodcastEpisodeFixture({ id: `episode-${index}`, episodeNumber: index + 1 }),
)
const topic = toTestTopicResponse({
	id: "topic-1",
	latestPodcastEpisode: episodes[0],
	podcast: {
		isEnabled: true,
		hasFullPodcastEpisodes: true,
		unpublishedPodcastEpisode: null,
		publicFeedUrl: "https://carlnotes.example/feed.xml",
		seasons: [2026, 2025],
		latestSeasonPodcastEpisodes: { podcastEpisodes: episodes },
		canRemovePodcastEpisodes: true,
	},
})

test("season selection retains loaded, linked, and latest episode precedence", () => {
	expect(toShownPodcastSeason([2026, 2025], "2025")).toBe(2025)
	expect(toShownPodcastSeason([2026, 2025], "2024")).toBe(2026)
	expect(toShownPodcastSeason([], undefined)).toBeUndefined()
	expect(
		toShownPodcastEpisodeId({ topic, loadedPodcastEpisode: episodes[1] ?? null, linkedPodcastEpisodeId: "linked" }),
	).toBe("episode-1")
	expect(
		toShownPodcastEpisodeId({
			topic,
			loadedPodcastEpisode: toPodcastEpisodeFixture({ topicId: "another-topic" }),
			linkedPodcastEpisodeId: "linked",
		}),
	).toBe("linked")
	expect(toShownPodcastEpisodeId({ topic, loadedPodcastEpisode: null, linkedPodcastEpisodeId: null })).toBe("episode-0")
})

test("season cards reset pages and preserve query context and removal permission", async () => {
	// retain the shared callbacks while swapping only the platform renderers
	let paging: ComponentProps<PodcastEpisodesCardElements["Pagination"]> | undefined
	let rows: ComponentProps<PodcastEpisodesCardElements["Row"]>[] = []
	let tabs: ComponentProps<PodcastEpisodesCardElements["Tab"]>[] = []
	const Group = ({ children }: { children: React.ReactNode }) => children
	const elements: PodcastEpisodesCardElements = {
		Section: Group,
		Card: ({ children }) => {
			// reset captures on both parent and internal page updates
			rows = []
			tabs = []
			return children
		},
		Tabs: Group,
		List: Group,
		Loading: () => null,
		Remove: () => null,
		Tab: (props) => {
			tabs.push(props)
			return null
		},
		Row: (props) => {
			rows.push(props)
			return null
		},
		Pagination: (props) => {
			paging = props
			return null
		},
	}
	let shownSeason = 2026
	let canRemove = true
	const harness = await renderTestHook(
		() => null,
		() => {
			// replace capture arrays for each render
			rows = []
			tabs = []
			return (
				<PodcastEpisodesCard
					topic={{
						...topic,
						podcast: topic.podcast ? { ...topic.podcast, canRemovePodcastEpisodes: canRemove } : null,
					}}
					shownSeason={shownSeason}
					episodes={episodes}
					isLoading={false}
					search="episode=linked&tag=coffee"
					selectedEpisodeId="episode-1"
					onOpenSeason={() => {}}
					onReload={async () => {}}
					onRemoved={async () => {}}
					elements={elements}
				/>
			)
		},
	)
	try {
		// the first page names only five episodes, with separate published links and selected playback
		expect(rows.map((row) => row.podcastEpisode.id)).toEqual(episodes.slice(0, 5).map((episode) => episode.id))
		expect(rows[1]?.isPlayButtonMuted).toBe(false)
		expect(rows[0]?.onRemovePodcastEpisode).toBeDefined()
		expect(tabs[1]?.search).toBe("?episode=linked&tag=coffee&season=2025")
		await act(async () => paging?.onOpenPage(2))
		expect(rows).toHaveLength(3)
		// changing the season returns to its first page and dropping permission removes the destructive action
		shownSeason = 2025
		canRemove = false
		await harness.render()
		expect(paging?.pageNumber).toBe(1)
		expect(rows).toHaveLength(5)
		expect(rows[0]?.onRemovePodcastEpisode).toBeUndefined()
	} finally {
		await harness.close()
	}
})
