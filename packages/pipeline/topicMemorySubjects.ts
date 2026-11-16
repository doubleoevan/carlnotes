import type { TopicMemoryPerson } from "@carlnotes/contracts/topicMemories"
import { type DbHandle, db, isFindingShown } from "@carlnotes/db"
import { findings } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemorySubjectAliases } from "@carlnotes/db/schema/topicMemories"
import { and, count, desc, eq, exists, inArray, isNotNull, or, sql } from "drizzle-orm"
import { toTopicMemoryPersonMatchKey, toTopicMemorySubject } from "./topicMemoryOperations"

const TOPIC_MEMORY_SUBJECT_LIMIT = 120
export type TopicMemorySubject = { subject: string; person: TopicMemoryPerson | null; aliases?: string[] }
export type TopicMemoryAliasEvidence = { aliasName: string; findingId: string }

/** Lists canonical spellings and verified aliases. Older Topics can start from the names they already use. */
export async function loadTopicMemorySubjects(topicId: string): Promise<TopicMemorySubject[]> {
	// fill the prompt with active subjects before older registered names
	const legacy = await db
		.select({ subject: topicMemories.subject, person: topicMemories.person })
		.from(topicMemories)
		.where(
			and(
				eq(topicMemories.topicId, topicId),
				eq(topicMemories.status, "active"),
				eq(topicMemories.isAtomic, true),
				eq(topicMemories.needsReview, false),
				isNotNull(topicMemories.subject),
			),
		)
		.groupBy(topicMemories.subject, topicMemories.person)
		.orderBy(desc(count()), topicMemories.subject)
		.limit(TOPIC_MEMORY_SUBJECT_LIMIT)
	const active = legacy.flatMap(({ subject }) => (subject ? [subject] : []))
	const proof = db
		.select({ id: findings.id })
		.from(findings)
		.where(
			and(
				eq(findings.id, topicMemorySubjectAliases.findingId),
				eq(findings.topicId, topicId),
				eq(findings.sourceVisibility, "public"),
				isFindingShown,
			),
		)
	const activeOrder = active.length
		? sql`case when ${inArray(topicMemorySubjectAliases.canonicalKey, active)} then 0 else 1 end`
		: undefined
	const registered = await db
		.select()
		.from(topicMemorySubjectAliases)
		.where(
			and(
				eq(topicMemorySubjectAliases.topicId, topicId),
				or(eq(topicMemorySubjectAliases.aliasKey, topicMemorySubjectAliases.canonicalKey), exists(proof)),
			),
		)
		.orderBy(
			...(activeOrder ? [activeOrder] : []),
			topicMemorySubjectAliases.canonicalKey,
			topicMemorySubjectAliases.aliasKey,
		)
		.limit(TOPIC_MEMORY_SUBJECT_LIMIT * 3)
	const subjects = new Map<string, TopicMemorySubject>()
	const registeredKeys = new Set(registered.map(({ aliasKey }) => aliasKey))
	for (const row of registered) {
		let subject = subjects.get(row.canonicalKey)
		if (!subject) {
			subject = { subject: row.canonicalName, person: row.person, aliases: [] }
			subjects.set(row.canonicalKey, subject)
		}
		if (row.aliasName !== row.canonicalName) {
			if ((subject.aliases?.length ?? 0) < 8) {
				subject.aliases?.push(row.aliasName)
			}
		}
	}
	return fillLegacyTopicMemorySubjects(subjects, registeredKeys, legacy)
}

function fillLegacyTopicMemorySubjects(
	subjects: Map<string, TopicMemorySubject>,
	registeredKeys: Set<string>,
	legacy: { subject: string | null; person: TopicMemoryPerson | null }[],
): TopicMemorySubject[] {
	for (const row of legacy) {
		if (row.subject && !registeredKeys.has(row.subject) && !subjects.has(row.subject)) {
			subjects.set(row.subject, {
				subject: row.person?.name ?? readTopicMemorySubjectName(row.subject),
				person: row.person,
			})
		}
	}
	const activeKeys = new Set(legacy.map(({ subject }) => subject))
	return [...subjects.entries()]
		.toSorted(([first], [second]) => Number(activeKeys.has(second)) - Number(activeKeys.has(first)))
		.slice(0, TOPIC_MEMORY_SUBJECT_LIMIT)
		.map(([, subject]) => subject)
}

/** Reads the subject from the stored identity tuple or an older plain name. */
export function readTopicMemorySubjectName(stored: string): string {
	try {
		const parsed: unknown = JSON.parse(stored)
		if (Array.isArray(parsed) && typeof parsed[0] === "string") {
			return parsed[0]
		}
	} catch {
		return stored
	}
	return stored
}

/** Looks up a verified alias in this Topic and keeps the identifying detail in the person key. */
export function resolveTopicMemorySubject<Claim extends Pick<TopicMemorySubject, "subject" | "person">>(
	claim: Claim,
	subjects: TopicMemorySubject[],
): Claim {
	const { subject, person } = claim
	const key = toTopicMemorySubject(subject, person)
	const canonical = subjects.find((entry) => namesForTopicMemorySubject(entry).includes(key))
	if (canonical) {
		return { ...claim, subject: canonical.subject, person: canonical.person }
	}
	const named = toCanonicalTopicMemoryPerson(person, subjects)
	return { ...claim, subject: named?.name ?? subject, person: named }
}

function namesForTopicMemorySubject({ subject, person, aliases = [] }: TopicMemorySubject): string[] {
	return [subject, ...aliases].map((name) => toTopicMemorySubject(name, person ? { ...person, name } : null))
}

/** Records the established spelling or an alias after the caller has verified its public Finding. */
export async function saveTopicMemorySubject({
	handle,
	topicId,
	identity,
	evidence,
}: {
	handle: DbHandle
	topicId: string
	identity: Pick<TopicMemorySubject, "subject" | "person">
	evidence?: TopicMemoryAliasEvidence
}): Promise<void> {
	const canonicalName = identity.person?.name ?? identity.subject
	const canonicalKey = toTopicMemorySubject(canonicalName, identity.person)
	const aliasName = evidence?.aliasName ?? canonicalName
	const aliasKey = toTopicMemorySubject(aliasName, identity.person ? { ...identity.person, name: aliasName } : null)
	await handle
		.insert(topicMemorySubjectAliases)
		.values({
			topicId,
			aliasKey,
			aliasName,
			canonicalKey,
			canonicalName,
			person: identity.person,
			findingId: evidence?.findingId,
		})
		.onConflictDoNothing()
}

/** Accepts a verbatim public excerpt that explicitly equates the two spellings. */
export function supportsTopicMemoryAlias({
	alias,
	canonical,
	quote,
	source,
}: {
	alias: string
	canonical: string
	quote: string
	source: string
}): boolean {
	const compact = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim()
	const evidence = compact(quote)
	const name = compact(canonical)
	const alternate = compact(alias)
	if (!name || !alternate || name === alternate || !evidence || !compact(source).includes(evidence)) {
		return false
	}
	return [
		matchesTopicMemoryAliasAbbreviation(name, alternate) ? `${name} (${alternate})` : "",
		`${name}, also known as ${alternate}`,
		`${name}, known as ${alternate}`,
		`${name} (aka ${alternate})`,
		`${alternate}, short for ${name}`,
	].some((example) => example !== "" && evidence.includes(example))
}

// require initials before reading a parenthetical as an alternate name
function matchesTopicMemoryAliasAbbreviation(name: string, alternate: string): boolean {
	const words = name.split(" ")
	const initials = words.map((word) => word[0]).join("")
	return words.length > 1 && initials === alternate.replaceAll(".", "")
}

/** Reuses the established person key for an unambiguous spelling with the same identifying detail. */
export function toCanonicalTopicMemoryPerson(
	person: TopicMemoryPerson | null,
	subjects: TopicMemorySubject[],
): TopicMemoryPerson | null {
	if (!person) {
		return null
	}
	const aliasKey = toTopicMemoryPersonAliasKey(person)
	const matches = subjects.flatMap(({ person: candidate }) =>
		candidate && toTopicMemoryPersonAliasKey(candidate) === aliasKey ? [candidate] : [],
	)
	const namesWithInitials = new Set(
		[person, ...matches].map(toTopicMemoryPersonMatchKey).filter((key) => key !== aliasKey),
	)
	// two conflicting initials mean the abbreviated spelling is ambiguous
	return namesWithInitials.size <= 1 ? (matches[0] ?? person) : person
}

/** A middle initial does not create a new person when the identifying detail is identical. */
function toTopicMemoryPersonAliasKey(person: TopicMemoryPerson): string | null {
	const key = toTopicMemoryPersonMatchKey(person)
	if (!key) {
		return null
	}
	const [name, detail] = JSON.parse(key) as [string, string]
	const parts = name.split(" ")
	const fullName = parts
		.filter((part, index) => index === 0 || index === parts.length - 1 || part.length !== 1)
		.join(" ")
	return JSON.stringify([fullName, detail])
}
