// a change to a finding the search lists: only its row changes, and each feed handler reports the change it makes
import { describe, expect, mock, test } from "bun:test"
import type { FindingSearchRow, SearchResultsPage } from "@carlnotes/contracts/search"
import { SEARCH_PAGE_FIXTURE } from "../../../.storybook/fixtures/search"
import { type FindingChange, toReportingFindingHandlers, toSearchPageWithFindingChange } from "./searchFindingChanges"

// the fixture page's finding row
function toFindingRow(searchPage: SearchResultsPage): FindingSearchRow {
	return searchPage.rows.find((searchRow) => searchRow.kind === "finding") as FindingSearchRow
}

describe("toSearchPageWithFindingChange", () => {
	test("changes the finding's row alone, and keeps the page's other fields", () => {
		// a card's page with its own search url
		const cardPage = { ...SEARCH_PAGE_FIXTURE, searchUrl: "https://carlnotes.test/search?q=espresso" }
		const findingId = toFindingRow(cardPage).finding.findingId
		const changedPage = toSearchPageWithFindingChange(cardPage, {
			findingId,
			topicFindingChange: { isBookmarked: true },
		})

		// the finding is bookmarked, every other row is the same object, and the url stays
		expect(toFindingRow(changedPage).finding.isBookmarked).toBe(true)
		expect(changedPage.rows.filter((searchRow) => searchRow.kind !== "finding")).toEqual(
			cardPage.rows.filter((searchRow) => searchRow.kind !== "finding"),
		)
		expect(changedPage.searchUrl).toBe(cardPage.searchUrl)
	})
})

describe("toReportingFindingHandlers", () => {
	test("each handler saves through the feed's and reports its change, and an open marks the finding read", () => {
		// the feed's handlers, and the changes reported
		const feedHandlers = {
			openTopicFinding: mock(),
			consumeTopicFinding: mock(),
			rateTopicFinding: mock(),
			bookmarkTopicFinding: mock(),
		}
		const findingChanges: FindingChange[] = []
		const reportingHandlers = toReportingFindingHandlers(feedHandlers, (findingChange) =>
			findingChanges.push(findingChange),
		)

		// one call of each
		reportingHandlers.openTopicFinding("finding-1")
		reportingHandlers.consumeTopicFinding("finding-1", false)
		reportingHandlers.rateTopicFinding("finding-1", "up")
		reportingHandlers.bookmarkTopicFinding("finding-1", true)

		// the feed's handlers ran, and the row heard each change
		expect(feedHandlers.rateTopicFinding).toHaveBeenCalledWith("finding-1", "up")
		expect(findingChanges.map((findingChange) => findingChange.topicFindingChange)).toEqual([
			{ isConsumed: true },
			{ isConsumed: false },
			{ rating: "up" },
			{ isBookmarked: true },
		])
	})
})
