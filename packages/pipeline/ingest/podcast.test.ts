// podcast ingester test cases. an iTunes response maps to the shows a Source can store
import { expect, test } from "bun:test"
import { toPodcasts } from "./podcast"

// two shows iTunes knows fully, plus entries missing the id a Source stores and the name it displays
const ITUNES_RESPONSE = {
	results: [
		{
			collectionId: 1528594034,
			collectionName: "Hard Fork",
			artistName: "The New York Times",
			feedUrl: "https://feeds.simplecast.com/6HKOhNgS",
		},
		{ collectionId: 1465393232, collectionName: "Hard Fork Decentralized" },
		{ collectionName: "No id" },
		{ collectionId: 999 },
	],
}

// an iTunes response maps to shows, and the id becomes a string because that is what a Source config holds
test("toPodcasts maps an iTunes response to storable shows", () => {
	const podcasts = toPodcasts(ITUNES_RESPONSE)
	expect(podcasts).toEqual([
		{
			podcastId: "1528594034",
			name: "Hard Fork",
			author: "The New York Times",
			feedUrl: "https://feeds.simplecast.com/6HKOhNgS",
		},
		{ podcastId: "1465393232", name: "Hard Fork Decentralized", author: null, feedUrl: null },
	])
})

// an entry with no id cannot be stored and one with no name has nothing to show, so both are skipped
test("toPodcasts skips entries with nothing to store or show", () => {
	expect(toPodcasts({ results: [{ collectionName: "No id" }, { collectionId: 999 }] })).toEqual([])
	expect(toPodcasts({})).toEqual([])
})
