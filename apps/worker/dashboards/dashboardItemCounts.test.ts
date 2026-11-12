// a played item's path: a topic's podcast episode opens its topic at the film or the podcast player, whichever format
// has more plays
import { expect, test } from "bun:test"
import type { PodcastEpisodeFormat } from "@carlnotes/contracts/podcast"
import type { DashboardDailyCountRow } from "./dashboardDailyCountRows"
import { toPlayItemPath } from "./dashboardItemCounts"

// one play row of the podcast episode in a format, on its topic's page at that format's player
function toPlayRow(format: PodcastEpisodeFormat, count: number): DashboardDailyCountRow {
	const anchor = format === "video" ? "film" : "podcast"
	return {
		itemId: "podcast-episode-1",
		title: "Espresso",
		path: `/topics/topic-1/espresso#${anchor}`,
		isPublic: true,
		day: "2026-11-09",
		placeKey: "",
		place: null,
		count,
		sketch: null,
		format,
	}
}

test("a played item opens its topic at the format with more plays, the podcast player on a tie", () => {
	expect(toPlayItemPath([toPlayRow("audio", 2), toPlayRow("video", 5)])).toBe("/topics/topic-1/espresso#film")
	expect(toPlayItemPath([toPlayRow("video", 1), toPlayRow("audio", 3)])).toBe("/topics/topic-1/espresso#podcast")
	expect(toPlayItemPath([toPlayRow("video", 2), toPlayRow("audio", 2)])).toBe("/topics/topic-1/espresso#podcast")
	expect(toPlayItemPath([toPlayRow("video", 4)])).toBe("/topics/topic-1/espresso#film")
})
