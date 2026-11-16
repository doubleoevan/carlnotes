// the paginated Journal and the feedback a Topic owner or team lead can submit
import { z } from "zod"
import { CONTROL_CHARACTER_PATTERN } from "./socialText"

export const topicMemoryKinds = ["fact", "correction"] as const
export const topicMemoryStatuses = ["active", "outdated", "rejected"] as const
// the structured fact types shared by extraction, storage, and grouping
export const topicMemoryClaimTypes = [
	"role",
	"education",
	"founding",
	"funding",
	"launch",
	"shutdown",
	"airDate",
	"runtime",
	"location",
	"price",
	"statistic",
	"other",
] as const
export type TopicMemoryClaimType = (typeof topicMemoryClaimTypes)[number]
export const TOPIC_MEMORY_TEXT_LIMIT = 400
export const TOPIC_MEMORY_NOTE_LIMIT = 400
export const TOPIC_MEMORY_PAGE_SIZE = 5
export const TOPIC_MEMORY_ACTIVE_LIMIT = 100
export const topicMemoryPerson = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.refine((value) => !CONTROL_CHARACTER_PATTERN.test(value)),
	identifyingDetail: z
		.string()
		.trim()
		.min(1)
		.max(160)
		.refine((value) => !CONTROL_CHARACTER_PATTERN.test(value)),
})
export type TopicMemoryPerson = z.infer<typeof topicMemoryPerson>

export const topicMemoryPageNumber = z.coerce
	.number()
	.int()
	.min(1)
	.max(Math.floor(Number.MAX_SAFE_INTEGER / TOPIC_MEMORY_PAGE_SIZE))
	.default(1)
export const topicMemoriesQuery = z.object({ page: topicMemoryPageNumber })
// clients can distinguish the saved topic memory limit from ordinary saved feedback
export const topicMemoryFeedbackResult = z.object({ status: z.enum(["saved", "savedTopicMemoryLimit"]) })
export const topicMemoryFeedbackPayload = z.object({
	rating: z.enum(["up", "down"]).nullable(),
	note: z
		.string()
		.trim()
		.max(TOPIC_MEMORY_NOTE_LIMIT)
		.refine((note) => !CONTROL_CHARACTER_PATTERN.test(note), "Corrections cannot contain control characters")
		.optional(),
})

export const topicMemoryFactDate = z.union([
	z.iso.date(),
	z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
	z.string().regex(/^\d{4}$/),
])

const topicMemory = z.object({
	id: z.string(),
	kind: z.enum(topicMemoryKinds),
	text: z.string(),
	factDate: topicMemoryFactDate.nullable().optional(),
	person: topicMemoryPerson.nullable().optional(),
	firstScanAt: z.string(),
	episodeNumber: z.number().int().nullable(),
	rating: z.enum(["up", "down"]).nullable(),
	note: z.string().nullable(),
})
export const topicMemoriesPage = z.object({
	items: z.array(topicMemory),
	pageCount: z.number().int().nonnegative(),
	canRate: z.boolean(),
})
export type TopicMemoryFeedbackResult = z.infer<typeof topicMemoryFeedbackResult>
export type TopicMemoriesPage = z.infer<typeof topicMemoriesPage>
export type TopicMemory = z.infer<typeof topicMemory>
export type TopicMemoryFeedback = z.infer<typeof topicMemoryFeedbackPayload>

/** Returns the last available page when a request exceeds the current count. */
export function toTopicMemoryPageNumber(page: number, pageCount: number): number {
	return Math.min(page, Math.max(1, pageCount))
}

// identify a leading pronoun or a bare predicate missing its subject
export const TOPIC_MEMORY_UNNAMED_SUBJECT_PATTERN =
	"^(?:(he|she|they|his|her|their)|((?:co[- ]?)?founded|launched|held|holds|joined|directs|graduated|earned|serves|travell?ed))(?=\\s|$)"
export const TOPIC_MEMORY_INCOMPLETE_CONTEXT_PATTERN =
	"(?:^(?:(?:the|their) trip (?:took|lasted)|travell?ed (?:for|about)|(?:its |their )?clients include|(?:was )?selected for|attends? alongside|(?:first|second|third) (?:faculty member|person) recognized)\\s|(?:^|\\s)travell?ed (?:for )?(?:about )?(?:a|one) month[.!]?\\s*$)"
export const TOPIC_MEMORY_JOB_START_PATTERN =
	"(?:^|\\s)(?:started|began) (?:as|(?:a|the|his|her|their) (?:new )?(?:position|role|job))(?=\\s|[.,]|$)"
export const TOPIC_MEMORY_CALENDAR_DATE_PATTERN = "(?:^|[^0-9])(?:19|20)[0-9]{2}(?:$|[^0-9])"
export const TOPIC_MEMORY_APPROXIMATE_MONTH_PATTERN =
	"(?<![0-9]\\s)(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+(?:19|20)[0-9]{2}(?![0-9])"
const INCOMPLETE_CONTEXT = new RegExp(TOPIC_MEMORY_INCOMPLETE_CONTEXT_PATTERN, "i")
const UNNAMED_SUBJECT = new RegExp(TOPIC_MEMORY_UNNAMED_SUBJECT_PATTERN, "i")
const JOB_START = new RegExp(TOPIC_MEMORY_JOB_START_PATTERN, "i")
const CALENDAR_DATE = new RegExp(TOPIC_MEMORY_CALENDAR_DATE_PATTERN)
const APPROXIMATE_MONTH = new RegExp(TOPIC_MEMORY_APPROXIMATE_MONTH_PATTERN, "i")
const MONTH_NAMES = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ")
const MONTH_AND_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
const FULL_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })

/** Preserves the precision of a job start stated in the claim. */
export function toTopicMemoryFactDate(text: string, factDate: string | null): string | null {
	if (!JOB_START.test(text)) {
		return factDate
	}
	// month-level wording cannot establish a precise day
	const month = text.match(APPROXIMATE_MONTH)?.[0]
	if (month) {
		const index = MONTH_NAMES.indexOf(month.slice(0, 3).toLowerCase())
		return `${month.slice(-4)}-${String(index + 1).padStart(2, "0")}`
	}
	return factDate ?? text.match(/\b(?:in|during) ((?:19|20)\d{2})\b/i)?.[1] ?? null
}

// format the event date at its stored precision
function toTopicMemoryDateLabel(factDate: string): string {
	if (factDate.length === 4) {
		return factDate
	}
	if (factDate.length === 7) {
		return MONTH_AND_YEAR.format(new Date(`${factDate}-01T00:00:00Z`))
	}
	return FULL_DATE.format(new Date(`${factDate}T00:00:00Z`))
}

/** Includes the event date when the claim text does not already give it. */
export function toTopicMemoryDisplayText(text: string, factDate?: string | null): string {
	if (!factDate) {
		return text
	}
	// preserve the original typography and avoid printing the same date twice
	const label = toTopicMemoryDateLabel(factDate)
	return text.toLowerCase().includes(label.toLowerCase()) || text.includes(factDate) ? text : `${text} · ${label}`
}

/** Makes a claim readable on its own when its source has established the person's name. */
export function toNamedTopicMemoryText(text: string, person: TopicMemoryPerson | null | undefined): string | null {
	if (INCOMPLETE_CONTEXT.test(text) || (JOB_START.test(text) && !CALENDAR_DATE.test(text))) {
		return null
	}
	const subjectless = text.match(UNNAMED_SUBJECT)
	if (!subjectless) {
		return person ? toFullSubjectName(text, person.name) : text
	}
	if (!person) {
		return null
	}

	// an action fragment needs its known actor before the verb
	if (subjectless[2]) {
		return `${person.name} ${text[0]?.toLowerCase()}${text.slice(1)}`
	}

	// preserve possessive subjects and singular verb agreement
	const pronoun = subjectless[0].toLowerCase()
	const tail = text.slice(pronoun.length)
	if (pronoun === "his" || pronoun === "her" || pronoun === "their") {
		return `${person.name}’s${tail}`
	}
	return (
		person.name +
		(pronoun === "they"
			? tail.replace(
					/^ (are|have|do|hold|work)\b/i,
					(_, verb: string) =>
						` ${({ are: "is", have: "has", do: "does", hold: "holds", work: "works" } as Record<string, string>)[verb.toLowerCase()]}`,
				)
			: tail)
	)
}

function toFullSubjectName(text: string, fullName: string): string {
	// use the evidence-backed full name for a leading given name or surname
	const parts = fullName.split(/\s+/)
	const given = parts[0]
	const surname = parts.at(-1)
	if (parts.length < 2 || !given || !surname || text.startsWith(fullName)) {
		return text
	}

	const bareName = [given, surname].find((name) => {
		const prefix = text.slice(0, name.length)
		return prefix.toLowerCase() === name.toLowerCase() && /^(?: [a-z]|['’])/.test(text.slice(name.length))
	})
	return bareName ? fullName + text.slice(bareName.length) : text
}
