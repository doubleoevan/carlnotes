// tests for the JSON-LD finding list
import { expect, test } from "bun:test"
import { toFindingListLd } from "./jsonLd"

// a finding without a relevance explanation keeps its entry and its position, with no description field at all
test("the finding list leaves out an empty description", () => {
	const findingList = toFindingListLd([
		{ title: "An explained finding", url: "https://example.test/1", relevanceExplanation: "Why it matters." },
		{ title: null, url: "https://example.test/2", relevanceExplanation: "" },
	])

	// the untitled finding is named by its url, and only the explained one has a description
	expect(findingList).toStrictEqual({
		"@type": "ItemList",
		name: "Carl's Top 2",
		itemListElement: [
			{
				"@type": "ListItem",
				position: 1,
				name: "An explained finding",
				url: "https://example.test/1",
				description: "Why it matters.",
			},
			{ "@type": "ListItem", position: 2, name: "https://example.test/2", url: "https://example.test/2" },
		],
	})
})
