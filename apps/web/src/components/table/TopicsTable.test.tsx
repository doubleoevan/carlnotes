// the topics table's footer lines up with its header in every column layout, the Emails column included
import { expect, test } from "bun:test"
import type { Topic } from "@carlnotes/contracts/profiles"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { TopicsTable } from "./TopicsTable"

// a public topic the user follows, with its scan emails switched as given, or no subscription to switch
function toTopic(id: string, isEmailEnabled: boolean | null): Topic {
	return {
		id,
		name: `Topic ${id}`,
		visibility: "public",
		createdAt: "2026-07-01T00:00:00.000Z",
		updatedAt: "2026-07-02T00:00:00.000Z",
		keptCount: 3,
		seenCount: 10,
		subscriberCount: 2,
		isEmailEnabled,
		latestPodcastEpisode: null,
	}
}

// the columns the header row and the footer row span. a footer cell's colSpan, which react renders as the colspan attribute,
// counts for each column it covers
function toColumnCounts(tableHtml: string): { headerColumnCount: number; footerColumnCount: number } {
	const headerHtml = tableHtml.slice(tableHtml.indexOf("<thead"), tableHtml.indexOf("</thead>"))
	const footerHtml = tableHtml.slice(tableHtml.indexOf("<tfoot"), tableHtml.indexOf("</tfoot>"))
	const footerCellCount = footerHtml.match(/<td[\s>]/g)?.length ?? 0
	const footerSpannedColumnCount = [...footerHtml.matchAll(/colspan="(\d+)"/gi)].reduce(
		(sum, [, colspan]) => sum + Number(colspan) - 1,
		0,
	)
	return {
		headerColumnCount: headerHtml.match(/<th[\s>]/g)?.length ?? 0,
		footerColumnCount: footerCellCount + footerSpannedColumnCount,
	}
}

// a team page with followed topics shows the Emails and Active columns, and the footer covers every one of them
test("the footer spans every column when the Emails and Active columns show", async () => {
	const tableHtml = await renderWithRouter(
		<TopicsTable
			topics={[toTopic("topic-1", true), toTopic("topic-2", false)]}
			includesNonPublicTopics
			onRemoveTopic={() => {}}
		/>,
	)
	const { headerColumnCount, footerColumnCount } = toColumnCounts(tableHtml)
	expect(headerColumnCount).toBe(9)
	expect(footerColumnCount).toBe(headerColumnCount)
})

// a profile with no subscription to switch shows neither column, and the footer still lines up
test("the footer spans every column without the Emails and Active columns", async () => {
	const tableHtml = await renderWithRouter(
		<TopicsTable topics={[toTopic("topic-1", null)]} includesNonPublicTopics={false} />,
	)
	const { headerColumnCount, footerColumnCount } = toColumnCounts(tableHtml)
	expect(headerColumnCount).toBe(5)
	expect(footerColumnCount).toBe(headerColumnCount)
})
