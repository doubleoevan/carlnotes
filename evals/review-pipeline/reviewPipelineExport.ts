// the review pipeline fixture export, from a public Topic's own Findings and other public topics' nearest Findings.
// the fixture is committed without page bodies, which go to the gitignored page cache beside the fixture.
// a written row keeps its own text in the fixture
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { and, desc, eq, inArray, isNotNull, ne, notExists, sql } from "drizzle-orm"
import { db } from "../../db"
import { attachments, findings, resources, topics } from "../../db/schema"
import { buildTopicScanContext } from "../../worker/attach"
import { loadBookmarkedFindingRows } from "../../worker/review"
import { getResourceContent } from "../../worker/store"
import type { EvalFixture, LabeledResource } from "./reviewPipelineEval"

// where the fixtures and their page cache live, and how many Resources a fixture holds
export const FIXTURES_DIRECTORY = import.meta.dir
export const PAGE_CACHE_DIRECTORY = join(FIXTURES_DIRECTORY, "page-cache")
const EXPORT_RESOURCE_COUNT = 50

// one page's text in the page cache. the ingester's snippet and the stored body
export type CachedPage = { snippet: string | null; content: string }

// one Resource as the export reads it, with the Finding's id and rating if the topic has a Finding of the Resource
type ExportedResourceRow = Omit<LabeledResource, "snippet" | "content" | "isRelevant" | "labelSource"> & {
	snippet: string | null
	contentKey: string | null
	findingId?: string
	rating?: "up" | "down" | null
}

/**
 * Writes the fixture and its page cache for a public Topic, keeping each earlier label and each written row.
 */
export async function exportFixture(topicId: string): Promise<void> {
	// load the topic
	const [topic] = await db
		.select({ name: topics.name, visibility: topics.visibility, ownerId: topics.ownerId, teamId: topics.teamId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`topic ${topicId} not found`)
	}

	// reject a topic that is not public
	if (topic.visibility !== "public") {
		throw new Error(`topic ${topicId} is ${topic.visibility}, and only a public topic's fixture may be written`)
	}

	// reject a topic with attachments. an attachment is its owner's alone
	const [topicAttachment] = await db
		.select({ id: attachments.id })
		.from(attachments)
		.where(eq(attachments.topicId, topicId))
	if (topicAttachment) {
		throw new Error(`topic ${topicId} has attachments, which its scan context would include`)
	}

	// load the topic's own Findings first, then other public topics' Findings up to the corpus size
	const { context } = await buildTopicScanContext(topicId)
	const topicResourceRows = await loadTopicResourceRows(topicId)
	const topicUrls = new Set(topicResourceRows.map((topicResourceRow) => topicResourceRow.url))
	const otherResourceRows = await loadOtherPublicResourceRows(topicId, EXPORT_RESOURCE_COUNT - topicResourceRows.length)
	const resourceRows = [
		...topicResourceRows,
		...otherResourceRows.filter((otherResourceRow) => !topicUrls.has(otherResourceRow.url)),
	]

	// label from an earlier fixture first, then from the topic's ratings and bookmarks
	const fixturePath = join(FIXTURES_DIRECTORY, `${topicId}.json`)
	const earlierLabels = toEarlierLabels(fixturePath)
	const bookmarkedFindingRows = await loadBookmarkedFindingRows(topicId, topic)
	const bookmarkedFindingIds = new Set(
		bookmarkedFindingRows.map((bookmarkedFindingRow) => bookmarkedFindingRow.findingId),
	)
	const labeledResources = resourceRows.map((resourceRow): LabeledResource => {
		const labeledResource = toLabeledResource(resourceRow, bookmarkedFindingIds)
		const earlierLabel = earlierLabels.get(resourceRow.url)
		return earlierLabel ? { ...labeledResource, ...earlierLabel } : labeledResource
	})

	// write each page's snippet and body to the gitignored page cache. getResourceContent reads the body as a Scan does
	const pageCache: Record<string, CachedPage> = {}
	for (const resourceRow of resourceRows) {
		const content = resourceRow.contentKey ? await getResourceContent(resourceRow.contentKey).catch(() => "") : ""
		pageCache[resourceRow.url] = { snippet: resourceRow.snippet, content }
	}
	mkdirSync(PAGE_CACHE_DIRECTORY, { recursive: true })
	writeFileSync(join(PAGE_CACHE_DIRECTORY, `${topicId}.json`), `${JSON.stringify(pageCache, null, "\t")}\n`)

	// write the fixture, keeping the injection sets and the written rows that an earlier fixture had.
	// a person fills in an empty injection set by hand
	const earlierFixture = existsSync(fixturePath) ? (JSON.parse(readFileSync(fixturePath, "utf8")) as EvalFixture) : null
	const writtenLabeledResources =
		earlierFixture?.labeledResources.filter((labeledResource) => labeledResource.labelSource === "written") ?? []
	const fixture: EvalFixture = {
		topic: { name: topic.name, context },
		labeledResources: [...labeledResources, ...writtenLabeledResources],
		injectionProse: earlierFixture?.injectionProse ?? [],
		injectionAttacks: earlierFixture?.injectionAttacks ?? [],
	}
	writeFileSync(fixturePath, `${JSON.stringify(fixture, null, "\t")}\n`)

	// say how much is left for a person to label
	const unlabeledCount = labeledResources.filter((labeledResource) => labeledResource.isRelevant === null).length
	console.log(`wrote ${labeledResources.length} resources to ${fixturePath}, ${unlabeledCount} of them still unlabeled`)
}

// the topic's Findings whose Resources have an embedding and stored content, as Resource rows with each Finding's rating
async function loadTopicResourceRows(topicId: string): Promise<ExportedResourceRow[]> {
	return db
		.select({
			title: resources.title,
			url: resources.url,
			snippet: resources.snippet,
			kind: resources.kind,
			contentKey: resources.contentKey,
			findingId: findings.id,
			rating: findings.rating,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(and(eq(findings.topicId, topicId), isNotNull(resources.embedding), isNotNull(resources.contentKey)))
		.orderBy(desc(findings.relevanceScore))
		.limit(EXPORT_RESOURCE_COUNT)
}

// the Resources of other public topics' Findings, nearest first to the topic's own Resources.
// a topic with attachments is left out
async function loadOtherPublicResourceRows(topicId: string, limit: number): Promise<ExportedResourceRow[]> {
	if (limit <= 0) {
		return []
	}

	// average the embeddings of the topic's own Resources. the nearest pages are measured from that average
	const [topicCentroidRow] = await db
		.select({ centroid: sql<string>`avg(${resources.embedding})::text` })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(and(eq(findings.topicId, topicId), isNotNull(resources.embedding)))
	if (!topicCentroidRow?.centroid) {
		return []
	}

	// the other public topics, leaving out any topic with attachments
	const otherPublicTopicIds = db
		.select({ id: topics.id })
		.from(topics)
		.where(
			and(
				eq(topics.visibility, "public"),
				ne(topics.id, topicId),
				notExists(db.select({ id: attachments.id }).from(attachments).where(eq(attachments.topicId, topics.id))),
			),
		)

	// read the nearest Resources, then drop a repeated url. two topics' Findings can share one Resource
	const otherResourceRows: ExportedResourceRow[] = await db
		.select({
			title: resources.title,
			url: resources.url,
			snippet: resources.snippet,
			kind: resources.kind,
			contentKey: resources.contentKey,
		})
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(
			and(
				inArray(findings.topicId, otherPublicTopicIds),
				isNotNull(resources.embedding),
				isNotNull(resources.contentKey),
			),
		)
		.orderBy(sql`${resources.embedding} <=> ${topicCentroidRow.centroid}::vector`)
		.limit(limit * 2)
	const firstResourceRows = otherResourceRows.filter(
		(otherResourceRow, i) =>
			otherResourceRows.findIndex((resourceRow) => resourceRow.url === otherResourceRow.url) === i,
	)
	return firstResourceRows.slice(0, limit)
}

// an earlier fixture's labels and their sources by url, so a second export never throws a person's labels away
function toEarlierLabels(fixturePath: string): Map<string, Pick<LabeledResource, "isRelevant" | "labelSource">> {
	if (!existsSync(fixturePath)) {
		return new Map()
	}
	const earlierFixture = JSON.parse(readFileSync(fixturePath, "utf8")) as EvalFixture
	const labeledEarlierResources = earlierFixture.labeledResources.filter(
		(earlierResource) => earlierResource.isRelevant !== null,
	)
	return new Map(labeledEarlierResources.map(({ url, isRelevant, labelSource }) => [url, { isRelevant, labelSource }]))
}

/**
 * Labels a Resource from its Finding's rating or bookmark, or leaves the Resource unlabeled for a person.
 */
export function toLabeledResource(
	resourceRow: ExportedResourceRow,
	bookmarkedFindingIds: Set<string>,
): LabeledResource {
	const { title, url, kind, findingId, rating } = resourceRow
	const unlabeledResource = { title, url, kind }

	// a thumbs down outweighs a bookmark
	if (rating === "down") {
		return { ...unlabeledResource, isRelevant: false, labelSource: "rating" }
	}

	// a thumbs up or a bookmark is relevant, and anything else waits for a person
	if (rating === "up") {
		return { ...unlabeledResource, isRelevant: true, labelSource: "rating" }
	}
	if (findingId && bookmarkedFindingIds.has(findingId)) {
		return { ...unlabeledResource, isRelevant: true, labelSource: "bookmark" }
	}
	return { ...unlabeledResource, isRelevant: null }
}
