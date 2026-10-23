// the site search's order: the match tiers, the kind order, the newest and trending sorts, and the page cut
import { describe, expect, test } from "bun:test"
import type { SearchRow } from "@carlnotes/contracts/search"
import { toMatchTier, toRankedSearchRows, toSearchPage } from "./searchRanks"

// a row of one kind with a name, and an optional date and count
function toSearchRow(
	kind: SearchRow["kind"],
	name: string,
	{ date = null, count = null }: { date?: string | null; count?: number | null } = {},
): SearchRow {
	return { kind, id: `${kind}-${name}`, name, path: `/${kind}`, date, count } as SearchRow
}

// the names of rows in order
function toNames(searchRows: SearchRow[]): string[] {
	return searchRows.map((searchRow) => searchRow.name)
}

describe("toMatchTier", () => {
	test("each way a name can match has its tier", () => {
		expect(toMatchTier("Orbit", "orbit")).toBe(1)
		expect(toMatchTier("Orbit Watch", "orbit")).toBe(2)
		expect(toMatchTier("Low Orbit Debris", "orbit")).toBe(3)
		expect(toMatchTier("Suborbital", "orbit")).toBe(4)
		expect(toMatchTier("Space junk", "orbit")).toBe(5)
	})

	test("a query's regular expression characters match literally", () => {
		expect(toMatchTier("Plans (2026)", "(2026)")).toBe(3)
		expect(toMatchTier("C++ notes", "c++")).toBe(2)
	})
})

describe("toRankedSearchRows", () => {
	test("an exact team name ranks before a topic that only contains it", () => {
		const searchRows = [toSearchRow("topic", "Orbit Debris Watch"), toSearchRow("team", "Orbit")]
		expect(toNames(toRankedSearchRows({ searchRows, query: "orbit", sort: "relevant" }))).toEqual([
			"Orbit",
			"Orbit Debris Watch",
		])
	})

	test("rows in one tier order by kind, then shorter name first", () => {
		const searchRows = [
			toSearchRow("team", "Orbit Watch"),
			toSearchRow("user", "orbitwatch"),
			toSearchRow("topic", "Orbit Watch"),
			toSearchRow("topic", "Orbit Watchers"),
			toSearchRow("podcastEpisode", "Orbit Weekly"),
		]
		const rankedRows = toRankedSearchRows({ searchRows, query: "orbit", sort: "relevant" })
		expect(rankedRows.map((searchRow) => searchRow.kind)).toEqual(["topic", "topic", "podcastEpisode", "team", "user"])
		expect(toNames(rankedRows).slice(0, 2)).toEqual(["Orbit Watch", "Orbit Watchers"])
	})

	test("a meaning match ranks after every name match", () => {
		const searchRows = [toSearchRow("podcastEpisode", "Space junk"), toSearchRow("team", "The Orbit Club")]
		expect(toNames(toRankedSearchRows({ searchRows, query: "orbit", sort: "relevant" }))).toEqual([
			"The Orbit Club",
			"Space junk",
		])
	})

	test("a username is tiered on its letters and digits", () => {
		const searchRows = [toSearchRow("topic", "Jane does orbits"), toSearchRow("user", "jane_doe")]
		expect(toNames(toRankedSearchRows({ searchRows, query: "Jane Doe", sort: "relevant" }))).toEqual([
			"jane_doe",
			"Jane does orbits",
		])
	})

	test("newest puts the latest first and the undated rows after, in relevance order", () => {
		const searchRows = [
			toSearchRow("team", "Orbit"),
			toSearchRow("topic", "Orbit old", { date: "2026-01-01T00:00:00Z" }),
			toSearchRow("finding", "Orbit new", { date: "2026-06-01T00:00:00Z" }),
			toSearchRow("user", "orbit"),
		]
		expect(toNames(toRankedSearchRows({ searchRows, query: "orbit", sort: "newest" }))).toEqual([
			"Orbit new",
			"Orbit old",
			"Orbit",
			"orbit",
		])
	})

	test("trending puts the most viewed first, and ties keep relevance order", () => {
		const searchRows = [
			toSearchRow("topic", "Orbit Watchers", { count: 3 }),
			toSearchRow("topic", "Orbit Watch", { count: 3 }),
			toSearchRow("podcastEpisode", "Orbit Weekly", { count: 9 }),
			toSearchRow("team", "Orbit"),
		]
		expect(toNames(toRankedSearchRows({ searchRows, query: "orbit", sort: "trending" }))).toEqual([
			"Orbit Weekly",
			"Orbit Watch",
			"Orbit Watchers",
			"Orbit",
		])
	})
})

describe("toSearchPage", () => {
	// twenty-three ranked rows
	const rankedRows = Array.from({ length: 23 }, (_, i) => toSearchRow("topic", `Orbit ${String(i).padStart(2, "0")}`))

	test("the pages continue each other with no row repeated", () => {
		const searchPages = [1, 2, 3].map((page) => toSearchPage(rankedRows, { page, size: 10 }))
		expect(searchPages.map((searchPage) => searchPage.rows.length)).toEqual([10, 10, 3])
		expect(searchPages.flatMap((searchPage) => toNames(searchPage.rows))).toEqual(toNames(rankedRows))
		expect(searchPages.every((searchPage) => searchPage.rowCount === 23 && searchPage.pageCount === 3)).toBe(true)
	})

	test("a page past the end is empty and keeps the counts", () => {
		expect(toSearchPage(rankedRows, { page: 9, size: 10 })).toEqual({
			rows: [],
			rowCount: 23,
			page: 9,
			pageCount: 3,
			pageSize: 10,
		})
	})

	test("an empty search has one empty page", () => {
		expect(toSearchPage([], { page: 1, size: 10 }).pageCount).toBe(1)
	})
})
