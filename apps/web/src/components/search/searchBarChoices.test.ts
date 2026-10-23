// the search bar's choices: what enter opens with one result, several, a pending search, and a highlighted row, the
// search page the bar's text opens, and the kinds after a toggle
import { describe, expect, test } from "bun:test"
import { resourceKinds } from "@carlnotes/contracts/enums"
import {
	SEARCH_RESULT_KINDS,
	type SearchResultsPage,
	type SearchRow,
	searchRequestPayload,
} from "@carlnotes/contracts/search"
import { toEnterChoice, toSearchBarPath, toToggledList } from "./searchBarChoices"

// a team row, and a search page holding some of them
function toTeamRow(name: string): SearchRow {
	return {
		kind: "team",
		id: name,
		name,
		path: `/teams/${name}`,
		date: null,
		count: null,
		team: { teamId: name, name, avatarVersion: null },
		topicCount: 0,
		memberCount: 1,
	}
}
function toSearchPage(searchRows: SearchRow[]): SearchResultsPage {
	return { rows: searchRows, rowCount: searchRows.length, page: 1, pageCount: 1, pageSize: 10, podcastEpisodes: [] }
}

describe("toEnterChoice", () => {
	test("enter opens the only result", () => {
		const onlyRow = toTeamRow("orbit")
		const searchPage = toSearchPage([onlyRow])
		expect(toEnterChoice({ highlightedRow: undefined, searchPage, isSearching: false, searchQuery: "orbit" })).toBe(
			onlyRow,
		)
	})

	test("enter with several results opens the search page", () => {
		const searchPage = toSearchPage([toTeamRow("orbit"), toTeamRow("orbital")])
		expect(toEnterChoice({ highlightedRow: undefined, searchPage, isSearching: false, searchQuery: "orbit" })).toBe(
			"searchPage",
		)
	})

	test("a pending search counts as more than one result", () => {
		const searchPage = toSearchPage([toTeamRow("orbit")])
		expect(toEnterChoice({ highlightedRow: undefined, searchPage, isSearching: true, searchQuery: "orbits" })).toBe(
			"searchPage",
		)
	})

	test("enter opens the highlighted row however many results there are", () => {
		const highlightedRow = toTeamRow("orbital")
		const searchPage = toSearchPage([toTeamRow("orbit"), highlightedRow, toTeamRow("orbiter")])
		expect(toEnterChoice({ highlightedRow, searchPage, isSearching: false, searchQuery: "orbit" })).toBe(highlightedRow)
	})

	test("a query under the minimum opens nothing", () => {
		expect(
			toEnterChoice({ highlightedRow: undefined, searchPage: null, isSearching: false, searchQuery: "o" }),
		).toBeNull()
	})
})

describe("toToggledList", () => {
	test("a toggle keeps the Filters menu's order", () => {
		expect(
			toToggledList({ items: ["teams", "topics"], toggledItem: "podcastEpisodes", menuOrder: SEARCH_RESULT_KINDS }),
		).toEqual(["topics", "podcastEpisodes", "teams"])
		expect(
			toToggledList({ items: ["read", "watch", "listen"], toggledItem: "watch", menuOrder: resourceKinds }),
		).toEqual(["read", "listen"])
	})

	test("the last item stays on", () => {
		expect(toToggledList({ items: ["teams"], toggledItem: "teams", menuOrder: SEARCH_RESULT_KINDS })).toEqual(["teams"])
	})
})

describe("toSearchBarPath", () => {
	test("text long enough to search opens its search, and shorter text opens none", () => {
		expect(toSearchBarPath(searchRequestPayload.parse({ q: "speed", kinds: ["topics"] }))).toBe(
			"/search?q=speed&kinds=topics",
		)
		expect(toSearchBarPath(searchRequestPayload.parse({ q: "s" }))).toBeNull()
	})
})
