// optional Topic hints boost the shared content matcher
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { normalizePersonalSourcesEmail } from "@carlnotes/server/personalSourcesEmailContent"
import { personalSourcesEmailFixture } from "@carlnotes/server/personalSourcesEmailTestFixtures"
import {
	readEmailReferenceIds,
	readEmailTopicHints,
	readEmailTopicSelection,
	resolveEmailTopicSelection,
	resolvePersonalSourcesEmailTopics,
} from "./emailTopic"
import * as matching from "./matchTopics"

const { payload } = normalizePersonalSourcesEmail({
	email: personalSourcesEmailFixture(),
	ownerEmail: "owner@example.com",
	isOwnerEmailVerified: true,
})
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

test.each([
	["topic: Coffee", "Body", ["Coffee"]],
	["Fwd: FW: ToPiC: COFEE", "Body", ["COFEE"]],
	["Newsletter", "\n topic: Coffee\nBody", ["Coffee"]],
	["topic:", "Body", []],
	["topic: Coffee", "topic: Tea\nBody", ["Coffee", "Tea"]],
	["Newsletter", "Body\ntopic: Coffee", []],
	["A topic: Coffee discussion", "Body", []],
])("reads optional hints only in the subject and first body line: %s", (subject, body, hints) => {
	expect(readEmailTopicHints(String(subject), String(body))).toEqual(hints)
})

test("only a nonempty subject hint accepts clear matches without approval", async () => {
	const topic = {
		id: "coffee",
		name: "Coffee",
		prompt: "Roasting",
		url: "https://carlnotes.com/topics/coffee",
		group: "editable" as const,
		relevance: 0.8,
	}
	const matcher = spyOn(matching, "matchPersonalSourcesTopics").mockResolvedValue({
		status: "matched",
		totalCount: 2,
		topics: [topic, { ...topic, id: "other" }],
	})
	for (const subject of ["Newsletter", "topic: COFEE", "Fwd: RE: ToPiC: Coffee", "topic:"]) {
		expect(await resolvePersonalSourcesEmailTopics("owner", subject, payload)).toMatchObject({
			topicIds: subject === "Newsletter" || subject === "topic:" ? [] : ["coffee", "other"],
			suggestions: [
				{ id: "coffee", name: "Coffee", url: topic.url },
				{ id: "other", name: "Coffee", url: topic.url },
			],
		})
		expect(matcher.mock.lastCall?.[0]).toMatchObject({
			userId: "owner",
			limit: null,
		})
	}
})

test("hints are separate from the full retained body and every safe link", async () => {
	const matcher = spyOn(matching, "matchPersonalSourcesTopics").mockResolvedValue({
		status: "matched",
		totalCount: 0,
		topics: [],
	})
	const text = "Late content ".repeat(2000)
	const links = Array.from({ length: 50 }, (_, index) => `https://example.com/${index}`)
	await resolvePersonalSourcesEmailTopics("owner", "topic: Cofee", { ...payload, text: `topic: Tea\n${text}`, links })
	expect(matcher.mock.lastCall?.[0]).toMatchObject({
		topicNameHints: ["Cofee", "Tea"],
		payload: { title: "Email", summary: text, links },
	})
})

test("moderate matches become choices without being saved automatically", async () => {
	spyOn(matching, "matchPersonalSourcesTopics").mockResolvedValue({
		status: "matched",
		totalCount: 1,
		topics: [
			{
				id: "coffee",
				name: "Coffee",
				prompt: "Roasting",
				url: "https://carlnotes.com/topics/coffee",
				group: "editable",
				relevance: 0.7,
			},
		],
	})
	expect(await resolvePersonalSourcesEmailTopics("owner", "topic: Coffee", payload)).toEqual({
		topicIds: [],
		suggestions: [{ id: "coffee", name: "Coffee", url: "https://carlnotes.com/topics/coffee" }],
	})
})

test("standard reply references and explicit numbers select stable choices", () => {
	const topics = [
		{ id: "first", name: "Coffee", url: "https://example.org/first" },
		{ id: "second", name: "Tea", url: "https://example.org/second" },
	]
	expect(readEmailReferenceIds({ "In-Reply-To": "<carl@example.com>", References: "<original@example.com>" })).toEqual([
		"<carl@example.com>",
		"<original@example.com>",
	])
	expect(readEmailReferenceIds({ Subject: "<original@example.com>" })).toEqual([])
	expect(readEmailTopicSelection("1, 2", topics)).toEqual({ topicIds: ["first", "second"], names: [] })
	expect(readEmailTopicSelection("2 and 2", topics)).toEqual({ topicIds: ["second"], names: [] })
	expect(readEmailTopicSelection("3", topics)).toBeNull()
	expect(readEmailTopicSelection("1, AI and ML", topics)).toEqual({ topicIds: ["first"], names: ["AI and ML"] })
})

test("no matches returns nothing and unavailable matching retries instead of claiming no match", async () => {
	const matcher = spyOn(matching, "matchPersonalSourcesTopics").mockResolvedValue({
		status: "matched",
		totalCount: 0,
		topics: [],
	})
	expect(await resolvePersonalSourcesEmailTopics("owner", "Newsletter", payload)).toEqual({
		topicIds: [],
		suggestions: [],
	})
	matcher.mockResolvedValue({ status: "unavailable" })
	await expect(resolvePersonalSourcesEmailTopics("owner", "Newsletter", payload)).rejects.toThrow(
		"temporarily unavailable",
	)
})

test.each([
	{
		text: "cofee",
		catalog: [
			["coffee", "Coffee"],
			["tea", "Tea"],
		],
		expected: ["coffee"],
	},
	{
		text: "1, cofee, Tea",
		catalog: [
			["coffee", "Coffee"],
			["tea", "Tea"],
		],
		expected: ["offered", "coffee", "tea"],
	},
	{ text: "AI and ML", catalog: [["ai", "AI and ML"]], expected: ["ai"] },
	{
		text: "Agent infra",
		catalog: [
			["first", "Agent infrastructure"],
			["second", "Agent infrastructure weekly"],
		],
		expected: null,
	},
	{
		text: "Coffee",
		catalog: [
			["first", "Coffee"],
			["second", "COFFEE"],
		],
		expected: null,
	},
	{ text: "unrelated topic", catalog: [["coffee", "Coffee"]], expected: null },
])(
	"written Topics resolve exact or clear fuzzy names and reject ambiguity: $text",
	async ({ text, catalog, expected }) => {
		const statements = stubConnectionPool(() => catalog.map((row) => [...row]))
		expect(
			await resolveEmailTopicSelection({
				userId: "owner",
				text,
				topics: [{ id: "offered", name: "Offered", url: "https://example.org/offered" }],
			}),
		).toEqual(expected ? [...expected] : null)
		expect(statements[0]?.text).toContain("team_members")
	},
)

test("written names can select every editable Topic without a separate reply-count cap", async () => {
	const catalog = Array.from({ length: 25 }, (_, index) => [`topic-${index}`, `Topic ${index}`])
	stubConnectionPool(() => catalog)
	const selected = await resolveEmailTopicSelection({
		userId: "owner",
		text: catalog.map((topic) => topic[1]).join(", "),
		topics: [],
	})
	expect(selected).toHaveLength(25)
})
