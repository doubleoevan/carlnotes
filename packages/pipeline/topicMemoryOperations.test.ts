import { expect, test } from "bun:test"
import { TOPIC_MEMORY_TEXT_LIMIT, toTopicMemoryDisplayText } from "@carlnotes/contracts/topicMemories"
import { canModelCombineTopicMemories } from "@carlnotes/contracts/topicMemoryWork"
import {
	normalizeTopicMemoryValue,
	topicMemoryDraftResponse,
	toTopicMemoryEmbeddingText,
	toTopicMemoryPersonMatchKey,
	toTopicMemoryWrite,
} from "./topicMemoryOperations"
import { haveCompatibleTopicMemoryPeople } from "./topicMemoryReconciliation"
import {
	resolveTopicMemorySubject,
	supportsTopicMemoryAlias,
	toCanonicalTopicMemoryPerson,
} from "./topicMemorySubjects"

const fact = {
	operation: "add" as const,
	kind: "fact" as const,
	importance: 0.8,
	subject: "Example lab",
	claimType: "founding" as const,
	value: "founded",
	text: "Example lab was founded.",
	factDate: "2026-11-01",
	person: null,
	sourceFindingIndexes: [0],
}

test("structured proposals keep their fields and cannot nominate a merge", () => {
	const [parsed] = topicMemoryDraftResponse.parse({ facts: [fact] }).facts
	expect(parsed && toTopicMemoryWrite(parsed)).toMatchObject({
		subject: fact.subject,
		claimType: fact.claimType,
		value: fact.value,
	})
	expect(topicMemoryDraftResponse.safeParse({ facts: [{ ...fact, operation: "merge" }] }).success).toBe(false)
	expect(toTopicMemoryWrite({ ...fact, operation: "skip", text: null })).toBeNull()
	expect(toTopicMemoryWrite({ ...fact, claimType: null })?.claimType).toBe("other")
})

test("values normalize formatting while preserving currency, qualifiers and billing units", () => {
	const normalized = normalizeTopicMemoryValue("US$1.2M per million output tokens")
	expect(normalized).toBe(normalizeTopicMemoryValue("USD 1,200,000 per million output tokens"))
	expect(normalized).not.toBe(normalizeTopicMemoryValue("USD 1.2 million per million input tokens"))
	expect(normalized).not.toBe(normalizeTopicMemoryValue("€1.2 million per million output tokens"))
	expect(normalizeTopicMemoryValue("December 1, 2026")).toBe("2026-12-01")
	expect(normalizeTopicMemoryValue("about 1,000 subscribers")).not.toBe(normalizeTopicMemoryValue("1,000 subscribers"))
})

test("subject spelling variants reuse identifying detail without bridging different people", () => {
	const identifyingDetail = "Chief operating officer at East Bay Community Foundation"
	const person = { name: "James M Cerenio", identifyingDetail }
	const established = [{ subject: "James M Cerenio", person }]
	expect(toCanonicalTopicMemoryPerson({ name: "James Cerenio", identifyingDetail }, established)).toEqual(person)
	const other = { name: "James A Cerenio", identifyingDetail }
	expect(toCanonicalTopicMemoryPerson(other, established)).toEqual(other)
	const namesake = { name: "James Cerenio", identifyingDetail: "University instructor" }
	expect(toCanonicalTopicMemoryPerson(namesake, established)).toEqual(namesake)
})

test("an alias resolves to its Topic identity while a namesake stays separate", () => {
	// use a verified surname alias with the exact identifying detail from the known appointment
	const person = {
		name: "James M Cerenio",
		identifyingDetail: "Chief operating officer at East Bay Community Foundation",
	}
	const subjects = [{ subject: person.name, person, aliases: ["James Cerenio", "Cerenio"] }]
	const named = resolveTopicMemorySubject({ subject: "Cerenio", person: { ...person, name: "Cerenio" } }, subjects)
	const namesake = resolveTopicMemorySubject(
		{
			subject: "Cerenio",
			person: { name: "Cerenio", identifyingDetail: "University instructor" },
		},
		subjects,
	)
	expect(named.person).toEqual(person)
	expect(haveCompatibleTopicMemoryPeople(named.person, person)).toBe(true)
	expect(haveCompatibleTopicMemoryPeople(namesake.person, person)).toBe(false)
	expect(haveCompatibleTopicMemoryPeople(null, person)).toBe(false)
})

test("an alias proposal must quote an explicit name match from the linked Finding", () => {
	const organization = { canonical: "Golden State Warriors", alias: "GSW", quote: "Golden State Warriors (GSW)" }
	expect(
		supportsTopicMemoryAlias({ ...organization, source: "The Golden State Warriors (GSW) announced a game." }),
	).toBe(true)
	expect(supportsTopicMemoryAlias({ ...organization, source: "Golden State Warriors played a game." })).toBe(false)
	const different = "Golden State Warriors (front office)"
	expect(
		supportsTopicMemoryAlias({
			canonical: organization.canonical,
			alias: "front office",
			quote: different,
			source: different,
		}),
	).toBe(false)
})

test("Flag Day Conspiracy's air date and runtime remain distinct for the same episode", () => {
	const subject = "the devil's lightning s4e2 flag day conspiracy"
	expect(
		canModelCombineTopicMemories(
			{ subject, claimType: "airDate", value: "2023-02-26" },
			{ subject, claimType: "runtime", value: "2023-02-26" },
		),
	).toBe(false)
})

test("the Tuesday/Thursday and Sunday SportsHouse leagues stay distinct", () => {
	const subject = "adult basketball events at sportshouse in redwood city"
	expect(
		canModelCombineTopicMemories(
			{ subject, claimType: "other", value: "tuesday/thursday co-rec beginner night league" },
			{ subject, claimType: "other", value: "sunday night co-rec league" },
		),
	).toBe(false)
})

test("model combine eligibility requires matching subjects and whole value containment", () => {
	const key = { subject: "festival cut", claimType: "runtime", value: "92 minutes" } as const
	expect(canModelCombineTopicMemories(key, { ...key, value: "92 minutes and 15 seconds" })).toBe(true)
	expect(canModelCombineTopicMemories(key, { ...key, subject: "theatrical cut" })).toBe(false)
	expect(canModelCombineTopicMemories(key, { ...key, value: "192 minutes" })).toBe(false)
	expect(canModelCombineTopicMemories(key, { ...key, value: "92.5 minutes" })).toBe(false)
})

test.each([
	"no-op",
	"The reader bookmarked the storefront.",
	"James Cerenio is COO. No event date in evidence (scan 2026-11-16).",
	"A\u0000B",
	"a".repeat(TOPIC_MEMORY_TEXT_LIMIT + 1),
])("a claim must contain usable fact wording", (text) => {
	expect(toTopicMemoryWrite({ ...fact, text })).toBeNull()
})

test("person names normalize while evidence-backed namesake identity details stay separate", () => {
	// exercise the same-name people found bundled together in the earlier evaluation
	const taipei = toTopicMemoryPersonMatchKey({ name: "  Ｗilson Chen ", identifyingDetail: "Taipei 101 Marketing" })
	expect(taipei).toBe(toTopicMemoryPersonMatchKey({ name: "Wilson Chen", identifyingDetail: "taipei 101 marketing" }))
	expect(taipei).not.toBe(
		toTopicMemoryPersonMatchKey({ name: "Wilson Chen", identifyingDetail: "Benedictine University" }),
	)
})

test("date-free vectors drop the attribution while written years still distinguish events", () => {
	// both embedding inputs use the same claim wording
	const first = "According to the source article, Jordan joined the lab in 2024."
	const second = "Jordan joined the lab in 2025, as reported by the source article."
	expect(toTopicMemoryEmbeddingText(first)).toBe("Jordan joined the lab.")
	expect(toTopicMemoryEmbeddingText(second)).toBe("Jordan joined the lab.")
	expect(toTopicMemoryEmbeddingText("The team released version 2.1 on 25 September,2026.")).toBe(
		"The team released version 2.1.",
	)
})

test("person match keys distinguish roles that depend on punctuation", () => {
	const name = "Jordan Kim"
	expect(toTopicMemoryPersonMatchKey({ name, identifyingDetail: "C++ instructor" })).not.toBe(
		toTopicMemoryPersonMatchKey({ name, identifyingDetail: "C# instructor" }),
	)
})

test("a topic memory names the person who earned the degree", () => {
	const statement = { ...fact, claimType: "education" as const, text: "He holds an MA from UC Irvine." }
	expect(toTopicMemoryWrite(statement)).toBeNull()
	expect(
		toTopicMemoryWrite({
			...statement,
			person: { name: "Wilson Chen", identifyingDetail: "Benedictine University" },
		})?.text,
	).toBe("Wilson Chen holds an MA from UC Irvine.")
})

test("trip duration needs both the traveler and a destination", () => {
	const travel = { ...fact, claimType: "other" as const }
	expect(toTopicMemoryWrite({ ...travel, text: "The trip took about a month." })).toBeNull()
	expect(toTopicMemoryWrite({ ...travel, text: "Traveled for about a month." })).toBeNull()
	expect(toTopicMemoryWrite({ ...travel, text: "Traveled to China for about a month." })).toBeNull()
	expect(
		toTopicMemoryWrite({ ...travel, text: "Mara traveled through Kyoto and Osaka for about a month." })?.text,
	).toBe("Mara traveled through Kyoto and Osaka for about a month.")
})

test("incomplete source claims stay out of writes until the missing context is supplied", () => {
	const person = { name: "Madelyn Wang", identifyingDetail: "Michael Kors Collection" }
	for (const text of [
		"Clients include schools and nonprofits.",
		"Selected for the EVPRI Ascending STARS program.",
		"Attends alongside Shala Monroque.",
		"Madelyn Wang started a new position at Michael Kors Collection as Associate Account Executive.",
	]) {
		expect(toTopicMemoryWrite({ ...fact, text, person })).toBeNull()
	}
	const text =
		"Madelyn Wang started a new position at Michael Kors Collection as Associate Account Executive in July 2025."
	expect(toTopicMemoryWrite({ ...fact, text, person, factDate: "2025-07-01" })).toMatchObject({
		text,
		factDate: "2025-07",
	})
	expect(toTopicMemoryEmbeddingText(text)).not.toContain("July 2025")
})

test("the claim and displayed date keep the source's year, month or day precision", () => {
	const text = "Example lab was founded."
	for (const [factDate, display] of [
		["2025", "2025"],
		["2025-07", "July 2025"],
		["2025-07-04", "July 4, 2025"],
	] as const) {
		expect(toTopicMemoryWrite({ ...fact, factDate })?.factDate).toBe(factDate)
		expect(toTopicMemoryDisplayText(text, factDate)).toBe(`${text} · ${display}`)
	}
	expect(toTopicMemoryDisplayText("The cafe opened in July 2025.", "2025-07")).toBe("The cafe opened in July 2025.")
	expect(toTopicMemoryEmbeddingText("The cafe opened in 2025-07.")).toBe("The cafe opened.")
	expect(toTopicMemoryWrite({ ...fact, factDate: "2025-13" })).toBeNull()
})

test("a stored full name replaces a leading surname or verb fragment", () => {
	const person = { name: "Joseph Chen", identifyingDetail: "University of Louisville Bioengineering" }
	const statement = { ...fact, person, text: "Chen was selected for the EVPRI Ascending STARS program." }
	expect(toTopicMemoryWrite(statement)?.text).toStartWith("Joseph Chen was selected")
	const founder = { name: "Jennifer Abrams Wang", identifyingDetail: "nest s.o.s. co-founder" }
	expect(toTopicMemoryWrite({ ...fact, text: "Co-founded nest s.o.s.", person: founder })?.text).toBe(
		"Jennifer Abrams Wang co-founded nest s.o.s.",
	)
})

test("an as-of date stays in the readable claim and out of its vector input", () => {
	const text = "Lillian Von Stauffenberg was living in London as of June 4, 2010."
	expect(toTopicMemoryWrite({ ...fact, text })?.text).toBe(text)
	expect(toTopicMemoryEmbeddingText(text)).toBe("Lillian Von Stauffenberg was living in London.")
})
