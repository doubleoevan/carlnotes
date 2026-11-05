import { afterEach, expect, test } from "bun:test"
import type { PersonalSourceEntry } from "@carlnotes/contracts/personalSources"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { loadPersonalSourceLinkOutcomes } from "./personalSourceLinkOutcomes"
import { personalSourcesLinks } from "./schema/personalSources"

afterEach(restoreConnectionPool)

// the fixture page has already passed the owner check and contains only public candidate links
const entry: PersonalSourceEntry = {
	id: "entry",
	sourceId: "source",
	topicId: "topic",
	origin: "send",
	title: "Research",
	text: "Private summary",
	sender: "Claude",
	senderKind: "agent",
	links: [
		"https://example.com/kept",
		"https://example.com/scored",
		"https://example.com/queued",
		"https://example.com/rejected",
		"https://example.com/legacy",
		"https://example.com/unqueued",
	],
	chatUrl: null,
	receivedAt: "2026-11-02T00:00:00Z",
	expiresAt: null,
	summarizedAt: null,
	omittedLinkCount: 0,
	linkOutcomes: [],
}

test("link states require persisted evidence and Finding links stay inside the authorized Topic", async () => {
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "personal_source_links"')) {
			return [0, 1, 2, 3, 4].map((position) =>
				toTableRow(personalSourcesLinks, {
					id: `link-${position}`,
					entryId: entry.id,
					position,
					state: position === 2 ? "claimed" : "considered",
					reviewOutcome: ["scored", "scored", "scored", "rejected", null][position],
					reviewReason: position === 3 ? "No readable text" : null,
				}),
			)
		}
		return text.includes('from "resources"')
			? [
					[entry.links[0], "finding", "Kept page title"],
					[entry.links[1], null, "Scored page title"],
					[entry.links[2], null, "  "],
				]
			: []
	})
	const result = (await loadPersonalSourceLinkOutcomes([entry]))[0]
	expect(result?.linkOutcomes.map((link) => link.status)).toEqual([
		"finding",
		"scored",
		"queued",
		"not_scored",
		"not_scored",
		"not_scored",
	])
	expect(result?.linkOutcomes[0]).toMatchObject({
		href: "/topics/topic?finding=finding",
		findingId: "finding",
		title: "Kept page title",
	})
	expect(result?.linkOutcomes[3]).toMatchObject({ reason: "No readable text" })
	expect(result?.linkOutcomes[5]).toMatchObject({ reason: "Not queued for review" })
	expect(result?.linkOutcomes[1]).toMatchObject({ title: "Scored page title", status: "scored" })
	expect(result?.linkOutcomes[2]).not.toHaveProperty("title")
	expect(queries).toHaveLength(2)
	const findingQuery = queries.find((query) => query.text.includes('from "resources"'))
	expect(findingQuery?.values).toContain("topic")
	expect(findingQuery?.text).toContain('"topic_id" =')
	expect(findingQuery?.text).toContain('"rating"')
	expect(findingQuery?.text).toContain('left join "findings"')
})

test("deleted or hidden Findings fall back to review evidence without changing the queued state", async () => {
	stubConnectionPool(({ text }) =>
		text.includes('from "personal_source_links"')
			? [
					toTableRow(personalSourcesLinks, {
						id: "link",
						entryId: entry.id,
						position: 0,
						state: "considered",
						reviewOutcome: "scored",
					}),
				]
			: [],
	)
	const result = await loadPersonalSourceLinkOutcomes([{ ...entry, links: entry.links.slice(0, 1) }])
	expect(result[0]?.linkOutcomes).toEqual(entry.links.slice(0, 1).map((url) => ({ url, status: "scored" as const })))
})

test("an empty authorized page performs no private reads", async () => {
	const queries = stubConnectionPool(() => [])
	expect(await loadPersonalSourceLinkOutcomes([])).toEqual([])
	expect(queries).toHaveLength(0)
})
