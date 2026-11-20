// group similar Findings and validate the model's topic memory drafts
import { CONTROL_CHARACTER_PATTERN } from "@carlnotes/contracts/socialText"
import { toOneLineText } from "@carlnotes/contracts/text"
import {
	TOPIC_MEMORY_TEXT_LIMIT,
	type TopicMemoryPerson,
	toNamedTopicMemoryText,
	topicMemoryClaimTypes,
	topicMemoryFactDate,
	topicMemoryKinds,
	topicMemoryPerson,
	toTopicMemoryFactDate,
} from "@carlnotes/contracts/topicMemories"
import { TOPIC_MEMORY_FINDING_GROUP_SIMILARITY } from "@carlnotes/contracts/topicMemoryWork"
import { toTopicMemorySimilarity } from "@carlnotes/db/topicMemoryGroups"
import { z } from "zod"
import type { TopicMemoryAliasEvidence } from "./topicMemorySubjects"

const topicMemoryClaim = z.object({
	text: z.string().trim().min(1).max(TOPIC_MEMORY_TEXT_LIMIT),
	factDate: topicMemoryFactDate.nullable(),
	person: topicMemoryPerson.nullable(),
	sourceFindingIndexes: z.array(z.number().int().min(0)).min(1).max(8),
})
export const structuredTopicMemoryClaim = topicMemoryClaim.extend({
	subject: z
		.string()
		.trim()
		.min(1)
		.max(160)
		.refine((value) => !CONTROL_CHARACTER_PATTERN.test(value)),
	claimType: z.enum(topicMemoryClaimTypes),
	value: z
		.string()
		.trim()
		.min(1)
		.max(TOPIC_MEMORY_TEXT_LIMIT)
		.refine((value) => !CONTROL_CHARACTER_PATTERN.test(value)),
})
const factFields = structuredTopicMemoryClaim.extend({
	importance: z.number().min(0).max(1),
	kind: z.enum(topicMemoryKinds),
})

export const topicMemoryDraftResponse = z.object({
	facts: z
		.array(
			factFields.extend({
				operation: z.enum(["add", "skip"]),
				subject: z.string().nullable(),
				claimType: z.enum(topicMemoryClaimTypes).nullable(),
				value: z.string().nullable(),
				text: z.string().nullable(),
				sourceFindingIndexes: z.array(z.number().int().min(0)).max(8),
				subjectAlias: z
					.object({
						observedName: z.string().trim().min(1).max(160),
						quote: z.string().trim().min(1).max(400),
						sourceFindingIndex: z.number().int().min(0),
					})
					.nullable()
					.optional(),
			}),
		)
		.min(1)
		.max(8),
})

type ModelTopicMemoryDraft = z.infer<typeof topicMemoryDraftResponse>["facts"][number]
export type TopicMemoryWrite = Omit<z.infer<typeof factFields>, "sourceFindingIndexes"> & {
	operation: "add"
	subjectAlias?: TopicMemoryAliasEvidence
}

// account activity can be evidence of interest, but belongs outside the topic memory sentence
const READER_ACTIVITY_PATTERN =
	/\b(?:the (?:reader|user|owner|topic owner) (?:has )?(?:bookmarked|rated|thumbed|marked as read|saved this finding)|(?:was|were) bookmarked (?:by the (?:reader|user|owner)|under the title))\b/i

// the Finding grouping input always has vectors in the current Resource embedding space
type Embedded = { embedding: number[] }

/**
 * Groups linked findings by similarity, using a stable input order.
 */
export function groupSimilarFindings<Finding extends Embedded>(findings: Finding[]): Finding[][] {
	return toLinkedTopicMemoryGroups(
		findings,
		(first, second) =>
			toTopicMemorySimilarity(first.embedding, second.embedding) >= TOPIC_MEMORY_FINDING_GROUP_SIMILARITY,
	)
}

/**
 * Joins linked rows without changing the first row of the earliest matching group.
 */
export function toLinkedTopicMemoryGroups<Row>(rows: Row[], areLinked: (first: Row, second: Row) => boolean): Row[][] {
	// a single row can connect two groups that were separate when their first rows arrived
	const groups: Row[][] = []
	for (const row of rows) {
		const matching = groups.filter((group) => group.some((member) => areLinked(row, member)))
		const first = matching[0]
		if (!first) {
			groups.push([row])
			continue
		}
		// absorb any other matching groups into the first survivor
		first.push(row)
		for (const group of matching.slice(1)) {
			first.push(...group)
			groups.splice(groups.indexOf(group), 1)
		}
	}
	return groups
}

// remove date and provenance from the embedding input
const MONTH_NAME =
	"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember|t)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?"
const DAY_OF_MONTH = "\\d{1,2}(?:st|nd|rd|th)?"
const OPTIONAL_YEAR = "(?:(?:,\\s*|\\s+)\\d{4})?"
const DATE_PREPOSITION = "(?:as of|in|since|during|by|on)\\s+"
const CALENDAR_YEAR = `${DATE_PREPOSITION}(?:19|20)\\d{2}`
const DATE_MENTION = new RegExp(
	`\\b(?:(?:${DATE_PREPOSITION})?(?:\\d{4}-\\d{2}(?:-\\d{2})?|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|${MONTH_NAME}\\s+(?:\\d{4}|${DAY_OF_MONTH}${OPTIONAL_YEAR})|${DAY_OF_MONTH}\\s+${MONTH_NAME}${OPTIONAL_YEAR})|${CALENDAR_YEAR})\\b`,
	"gi",
)

/**
 * Returns only the claim wording for the embedding model.
 */
export function toTopicMemoryEmbeddingText(text: string): string {
	// drop event and observation dates from the vector while keeping quantities and release numbers
	return text
		.replace(/^according to [^,]+,\s*/i, "")
		.replace(/(?:,?\s+(?:according to|as reported by|as reported in|as documented in) [^.!?]+)(?=[.!?]?$)/i, "")
		.replace(DATE_MENTION, "")
		.replace(/\s+/g, " ")
		.replace(/\s+([,.!?])/g, "$1")
		.trim()
}

/**
 * Normalizes both parts of a person's identity. A namesake's context stays distinct.
 */
export function toTopicMemoryPersonMatchKey(person: TopicMemoryPerson | null): string | null {
	if (!person) {
		return null
	}
	// preserve symbols that distinguish roles such as C++ and C# instructor
	const name = person.name
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
	// the identifying detail keeps its plus and hash signs
	const detail = person.identifyingDetail
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}+#]+/gu, " ")
		.trim()
	return name && detail ? JSON.stringify([name, detail]) : null
}

/** Converts a model candidate to a draft for the evidence and claim checks. */
export function toTopicMemoryDraft(proposal: ModelTopicMemoryDraft): TopicMemoryWrite | null {
	if (proposal.operation === "skip") {
		return null
	}
	// a model can leak trace metadata into a claim. discard those candidates
	const fact = factFields.safeParse({ ...proposal, claimType: proposal.claimType ?? "other" })
	if (
		!fact.success ||
		CONTROL_CHARACTER_PATTERN.test(fact.data.text) ||
		(fact.data.person && !toTopicMemoryPersonMatchKey(fact.data.person)) ||
		// text about a reader's activity, a no-op, or a note about dates or Scans
		READER_ACTIVITY_PATTERN.test(fact.data.text) ||
		/^no[\s\p{Dash_Punctuation}]*op[.!]?$/iu.test(fact.data.text) ||
		/\b(?:no (?:event |announcement )?date in evidence|scans? \d{4}-\d{2}-\d{2})\b/i.test(fact.data.text)
	) {
		return null
	}
	// a line break in a stored field would start a second row where a prompt lists topic memories line by line
	const { sourceFindingIndexes: _sourceFindingIndexes, person, ...write } = fact.data
	const text = toOneLineText(write.text)
	return {
		...write,
		text,
		subject: toOneLineText(write.subject),
		value: toOneLineText(write.value),
		person: person && {
			name: toOneLineText(person.name),
			identifyingDetail: toOneLineText(person.identifyingDetail),
		},
		factDate: toTopicMemoryFactDate(text, write.factDate),
		operation: "add",
	}
}

/** Accepts a brief standalone statement after validation or a source-grounded rewrite. */
export function toTopicMemoryWrite(proposal: ModelTopicMemoryDraft): TopicMemoryWrite | null {
	const draft = toTopicMemoryDraft(proposal)
	return draft ? toStandaloneTopicMemory(draft) : null
}

/** Completes known subject names and rejects a statement that still needs context. */
export function toStandaloneTopicMemory<Claim extends Pick<TopicMemoryWrite, "text" | "person">>(
	claim: Claim,
): Claim | null {
	const text = toNamedTopicMemoryText(claim.text, claim.person)
	return text && text.length <= TOPIC_MEMORY_TEXT_LIMIT && !CONTROL_CHARACTER_PATTERN.test(text)
		? { ...claim, text }
		: null
}

/** Returns the exact subject key, with identifying detail for people. */
export function toTopicMemorySubject(subject: string, person: TopicMemoryPerson | null): string {
	return toTopicMemoryPersonMatchKey(person) ?? JSON.stringify([normalizeTopicMemoryValue(subject)])
}

/** Normalizes storage values while preserving the readable claim in text. */
export function normalizeTopicMemoryValue(value: string): string {
	return value
		.normalize("NFKC")
		.toLowerCase()
		.replace(/\b(?:us\$|usd\s*)(?=\s*\d)/gu, "usd ")
		.replace(/(?:€|\beur\s*)(?=\s*\d)/gu, "eur ")
		.replace(/(?:£|\bgbp\s*)(?=\s*\d)/gu, "gbp ")
		.replace(
			/([$]|\b(?:usd|eur|gbp)\s+)\s*(\d+(?:,\d{3})*(?:\.\d+)?)([kmb])\b/gu,
			(_, currency: string, number: string, scale: string) => `${currency}${expandTopicMemoryQuantity(number, scale)}`,
		)
		.replace(
			/(?<![\p{L}\p{N}.])(\d+(?:,\d{3})*(?:\.\d+)?)\s+(thousand|million|billion)\b/gu,
			(_, number: string, scale: string) => expandTopicMemoryQuantity(number, scale),
		)
		.replace(/\b\d{1,3}(?:,\d{3})+\b/gu, (number) => number.replaceAll(",", ""))
		.replace(
			/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})\b/gu,
			(date, month: string, day: string, year: string) => {
				const parsed = new Date(`${month} ${day}, ${year} UTC`)
				return parsed.getUTCDate() === Number(day) ? parsed.toISOString().slice(0, 10) : date
			},
		)
		.replace(/\s*[–—]\s*/gu, " - ")
		.replace(/\s+/gu, " ")
		.trim()
}

function expandTopicMemoryQuantity(number: string, scale: string): string {
	// move the decimal point with strings, so large prices keep their exact precision
	const places = scale === "k" || scale === "thousand" ? 3 : scale === "m" || scale === "million" ? 6 : 9
	const [whole, fraction = ""] = number.replaceAll(",", "").split(".")
	const digits = `${whole}${fraction.padEnd(places, "0")}`
	const decimal = (whole?.length ?? 0) + places
	return [digits.slice(0, decimal), digits.slice(decimal).replace(/0+$/u, "")].filter(Boolean).join(".")
}
