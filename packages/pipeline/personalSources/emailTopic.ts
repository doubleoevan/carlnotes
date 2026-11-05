// manual topic hints boost the shared content matcher without forcing an unrelated destination
import type { PersonalSourceEntryPayload } from "@carlnotes/contracts/personalSources"
import type { PersonalSourcesEmailTopicChoice } from "@carlnotes/contracts/personalSourcesEmail"
import { TOPIC_NAME_CHARS } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { topics as topicTable } from "@carlnotes/db/schema/topics"
import { toEditableTopicFilter } from "@carlnotes/db/topicPermissions"
import { EMAIL_TOPIC_RELEVANCE_FLOOR, matchPersonalSourcesTopics, toTopicNameSimilarity } from "./matchTopics"

/**
 * Reads optional name hints only from the subject and first body line.
 */
export function readEmailTopicHints(subject: string, body: string): string[] {
	const subjectLine = subject.trim().replace(/^(?:(?:fwd?|re):\s*)+/i, "")
	const firstBodyLine = body.trimStart().split(/\r?\n/, 1)[0] ?? ""
	const hints = [subjectLine, firstBodyLine]
		.filter((line) => /^topic\s*:/i.test(line))
		.map((line) =>
			line
				.replace(/^topic\s*:/i, "")
				.trim()
				.slice(0, TOPIC_NAME_CHARS),
		)
	return [...new Set(hints.filter(Boolean))]
}

/**
 * Resolves every clear editable destination without storing routing content or creating a Topic.
 */
export async function resolvePersonalSourcesEmailTopics(
	userId: string,
	subject: string,
	payload: PersonalSourceEntryPayload,
): Promise<{ topicIds: string[]; suggestions: PersonalSourcesEmailTopicChoice[] }> {
	// keep hints separate from message content so a name alone cannot force acceptance
	const subjectLine = subject.trim().replace(/^(?:(?:fwd?|re):\s*)+/i, "")
	const bodyLines = payload.text.trimStart().split(/\r?\n/)
	const summary = /^topic\s*:/i.test(bodyLines[0] ?? "") ? bodyLines.slice(1).join("\n") : payload.text
	const matches = await matchPersonalSourcesTopics({
		userId,
		limit: null,
		topicNameHints: readEmailTopicHints(subject, payload.text),
		payload: { title: /^topic\s*:/i.test(subjectLine) ? "Email" : payload.title, summary, links: payload.links },
	})
	if (matches.status === "unavailable") {
		throw new Error("Email Topic matching is temporarily unavailable")
	}
	return {
		topicIds: matches.topics.filter((topic) => topic.relevance >= EMAIL_TOPIC_RELEVANCE_FLOOR).map((topic) => topic.id),
		suggestions: matches.topics.slice(0, 5).map(({ id, name, url }) => ({ id, name, url })),
	}
}

/**
 * Reads real message references in nearest-parent order.
 */
export function readEmailReferenceIds(headers: Record<string, string>): string[] {
	const names = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]))
	const parent = (names.get("in-reply-to") ?? "").match(/<[^<>\s]+>/g) ?? []
	const references = (names.get("references") ?? "").match(/<[^<>\s]+>/g) ?? []
	return [...new Set([...parent, ...references.reverse()])].filter((id) => id.length <= 998).slice(0, 30)
}

/**
 * Resolves an explicit numbered reply without a model call.
 */
export function readEmailTopicSelection(
	text: string,
	topics: PersonalSourcesEmailTopicChoice[],
): { topicIds: string[]; names: string[] } | null {
	const reply = text.trim().replace(/[.!]+$/, "")
	if (/^(yes|all)$/i.test(reply)) {
		return { topicIds: topics.map(({ id }) => id), names: [] }
	}
	const parts = reply.replace(/(\d)\s+(?:and|plus)\s+(?=\d)/gi, "$1,").split(/[,;\n]+/)
	const topicIds: string[] = []
	const names: string[] = []
	for (const part of parts) {
		const name = part
			.trim()
			.replace(/^(and|also|plus)\s+/i, "")
			.replace(/^topic\s*:\s*/i, "")
		if (!name) {
			return null
		}
		if (/^\d+$/.test(name)) {
			const topic = topics[Number(name) - 1]
			if (!topic) {
				return null
			}
			topicIds.push(topic.id)
		} else {
			names.push(name)
		}
	}
	return { topicIds: [...new Set(topicIds)], names: [...new Set(names)] }
}

/**
 * Resolves numbers and written names against current editable Topics.
 */
export async function resolveEmailTopicSelection({
	userId,
	text,
	topics,
}: {
	userId: string
	text: string
	topics: PersonalSourcesEmailTopicChoice[]
}): Promise<string[] | null> {
	const selection = readEmailTopicSelection(text, topics)
	if (!selection) {
		return null
	}
	if (!selection.names.length) {
		return selection.topicIds
	}
	const catalog = await db
		.select({ id: topicTable.id, name: topicTable.name })
		.from(topicTable)
		.where(toEditableTopicFilter(userId))
	for (const name of selection.names) {
		const id = toWrittenTopicId(name, catalog)
		if (!id) {
			return null
		}
		selection.topicIds.push(id)
	}
	return [...new Set(selection.topicIds)]
}

// prefer exact names and accept a fuzzy name only when it clearly beats alternatives
function toWrittenTopicId(name: string, catalog: { id: string; name: string }[]): string | null {
	const exact = catalog.filter((topic) => topic.name.toLowerCase() === name.toLowerCase())
	if (exact.length) {
		return exact.length === 1 ? (exact[0]?.id ?? null) : null
	}
	const ranked = catalog
		.map((topic) => ({ id: topic.id, score: toTopicNameSimilarity({ name: topic.name, hint: name }) }))
		.sort((left, right) => right.score - left.score)
	const best = ranked[0]
	return best && best.score >= 0.7 && best.score - (ranked[1]?.score ?? 0) >= 0.15 ? best.id : null
}
