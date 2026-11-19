import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as client from "@carlnotes/client/podcastEpisodeClient"
import { toPodcastEpisodeFixture, toTopicPodcastFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { PodcastEpisodeRemovalProvider } from "@carlnotes/core/components/PodcastEpisodeRemovalProvider"
import { PodcastEpisodesCard, type PodcastEpisodesCardElements } from "@carlnotes/core/components/PodcastEpisodesCard"
import { RemovePodcastEpisodeDialog } from "@carlnotes/core/components/RemovePodcastEpisodeDialog"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

const episodes = ["A", "B"].map((id) => toPodcastEpisodeFixture({ id, title: id }))
const topic = toTestTopicResponse({ podcast: toTopicPodcastFixture({ canRemovePodcastEpisodes: true }) })
const elements: PodcastEpisodesCardElements = {
	Section: ({ countLabel, children }) => (
		<section>
			{countLabel}
			{children}
		</section>
	),
	Card: ({ children }) => <div>{children}</div>,
	Tabs: () => null,
	Tab: () => null,
	List: ({ children }) => <ol>{children}</ol>,
	Loading: () => null,
	Pagination: () => null,
	Row: ({ podcastEpisode, onRemovePodcastEpisode }) => (
		<li>
			{podcastEpisode.title}
			{onRemovePodcastEpisode && (
				<button type="button" onClick={onRemovePodcastEpisode}>
					Remove {podcastEpisode.title}
				</button>
			)}
		</li>
	),
	Remove: (props) => (
		<RemovePodcastEpisodeDialog
			{...props}
			userId="owner"
			Confirm={({ onConfirm }) => (
				<button type="button" onClick={() => void onConfirm()}>
					Confirm removal
				</button>
			)}
		/>
	),
}
afterEach(() => mock.restore())

test("both lists update before the server responds, and concurrent removals roll back independently", async () => {
	const first = Promise.withResolvers<boolean>()
	const second = Promise.withResolvers<boolean>()
	const remove = spyOn(client, "sendRemovePodcastEpisode")
		.mockReturnValueOnce(first.promise)
		.mockReturnValueOnce(second.promise)
	const refresh = mock(async () => {})
	const props = {
		elements,
		topic,
		episodes,
		shownSeason: 2026,
		selectedEpisodeId: null,
		isLoading: false,
		search: "",
		onReload: refresh,
		onRemoved: refresh,
		onOpenSeason: () => {},
	}
	const harness = await renderTestHook(
		() => null,
		() => (
			<PodcastEpisodeRemovalProvider>
				<PodcastEpisodesCard {...props} filmList={{ latestFilmPodcastEpisodeId: "A", onPlayFilm: () => {} }} />
				<PodcastEpisodesCard {...props} />
			</PodcastEpisodeRemovalProvider>
		),
	)
	const click = async (label: string): Promise<void> => {
		const button = Array.from(harness.container.querySelectorAll("button")).find((row) => row.textContent === label)
		if (!button) {
			throw new Error(`Missing ${label}`)
		}
		await act(async () => button.click())
	}
	try {
		await click("Remove A")
		await click("Confirm removal")
		expect(harness.container.textContent).not.toContain("Confirm removal")
		expect(harness.container.querySelectorAll("li")).toHaveLength(2)
		expect(harness.container.textContent).toContain("1 episode")
		expect(harness.container.textContent).toContain("1 film")
		await click("Remove B")
		await click("Confirm removal")
		expect(harness.container.querySelectorAll("li")).toHaveLength(0)
		expect(remove.mock.calls).toEqual([["A"], ["B"]])
		await act(async () => {
			second.resolve(true)
			first.resolve(false)
		})
		expect(harness.container.querySelectorAll("li")).toHaveLength(2)
		expect(harness.container.textContent).toContain("Remove A")
		expect(harness.container.textContent).not.toContain("Remove B")
		expect(refresh).toHaveBeenCalledTimes(2)
	} finally {
		await harness.close()
	}
})
