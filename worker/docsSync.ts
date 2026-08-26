// this script embeds the docs pages into docs_chunks, the sections chat quotes when a question asks about the app
import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { inArray, sql } from "drizzle-orm"
import { connectionPool, db } from "../db"
import { docsChunks, EMBED_MODEL_NAME } from "../db/schema"
import { embedVectors } from "./models"

// where the docs Markdown lives, relative to the repo root that every script runs from
const DOCS_DIR = "docs/src/content/docs"

// a docs section heading for the table: the page and heading it came from, its words, and the hash that skips re-embedding
type DocsSection = { page: string; heading: string; content: string; contentHash: string }

/**
 * Split one page into sections: the intro under the page title, then one per ## heading.
 */
export function toSections(page: string, markdown: string): DocsSection[] {
	// pull the title out of the frontmatter, then drop the frontmatter itself
	const title = markdown.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? page
	const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, "").trim()

	// split on the ## headings, keeping the text before the first heading as the page's intro section
	const parts = body.split(/^## /m)
	const sections = [{ heading: title, text: parts[0] ?? "" }]
	for (const part of parts.slice(1)) {
		// a heading at the very end of the page has no newline after it, so no text
		const headingEnd = part.indexOf("\n")
		const heading = headingEnd === -1 ? part.trim() : part.slice(0, headingEnd).trim()
		sections.push({ heading, text: headingEnd === -1 ? "" : part.slice(headingEnd + 1) })
	}

	// prefix every section with the page title, so its embedding and its quoted text both name the page they belong to
	return sections
		.filter((section) => section.text.trim())
		.map(({ heading, text }) => {
			const content = `${title === heading ? title : `${title}: ${heading}`}\n\n${text.trim()}`
			return { page, heading, content, contentHash: createHash("sha256").update(content).digest("hex") }
		})
}

/**
 * Read every docs page, embed the new and changed sections, and delete the rows for sections that are gone.
 */
async function syncDocsChunks(): Promise<void> {
	// gather every page's sections from the Markdown source
	const docsFiles = (await readdir(DOCS_DIR, { recursive: true })).filter((file) => file.endsWith(".md"))
	const docsSections: DocsSection[] = []
	for (const docsFile of docsFiles) {
		const markdown = await Bun.file(join(DOCS_DIR, docsFile)).text()
		docsSections.push(...toSections(docsFile.replace(/\.md$/, ""), markdown))
	}

	// compare against the stored rows: a section re-embeds when it is new, its words changed, or the model changed
	const docsChunkRows = await db
		.select({
			id: docsChunks.id,
			page: docsChunks.page,
			heading: docsChunks.heading,
			contentHash: docsChunks.contentHash,
			embeddingModel: docsChunks.embeddingModel,
		})
		.from(docsChunks)
	const docsChunkRowByKey = new Map(
		docsChunkRows.map((docsChunkRow) => [`${docsChunkRow.page}\n${docsChunkRow.heading}`, docsChunkRow]),
	)
	// a section is re-embedded when it is new, its words changed, or the embedding model moved on
	const changedDocsSections = docsSections.filter((section) => {
		const docsChunkRow = docsChunkRowByKey.get(`${section.page}\n${section.heading}`)
		return (
			!docsChunkRow ||
			docsChunkRow.contentHash !== section.contentHash ||
			docsChunkRow.embeddingModel !== EMBED_MODEL_NAME
		)
	})

	// embed the changed sections in one batch and upsert them over the (page, heading) key
	if (changedDocsSections.length > 0) {
		const docsSectionVectors = await embedVectors(changedDocsSections.map((docsSection) => docsSection.content))
		const docsChunkValues = changedDocsSections.map((docsSection, index) => {
			// a missing vector means the batch and its results can no longer be paired up
			const docsSectionEmbedding = docsSectionVectors[index]
			if (!docsSectionEmbedding) {
				throw new Error(
					`embed batch returned ${docsSectionVectors.length} vectors for ${changedDocsSections.length} texts`,
				)
			}
			return { ...docsSection, embedding: docsSectionEmbedding, embeddingModel: EMBED_MODEL_NAME }
		})
		// write over the (page, heading) key, so an edited section replaces its old row
		await db
			.insert(docsChunks)
			.values(docsChunkValues)
			.onConflictDoUpdate({
				target: [docsChunks.page, docsChunks.heading],
				set: {
					content: sql`excluded.content`,
					contentHash: sql`excluded.content_hash`,
					embedding: sql`excluded.embedding`,
					embeddingModel: sql`excluded.embedding_model`,
					updatedAt: new Date(),
				},
			})
	}

	// delete the rows whose docs section no longer exists in the docs
	const docsSectionKeys = new Set(docsSections.map((docsSection) => `${docsSection.page}\n${docsSection.heading}`))
	const deleteDocsChunkIds = docsChunkRows
		.filter((docsChunkRow) => !docsSectionKeys.has(`${docsChunkRow.page}\n${docsChunkRow.heading}`))
		.map((docsChunkRow) => docsChunkRow.id)
	if (deleteDocsChunkIds.length > 0) {
		await db.delete(docsChunks).where(inArray(docsChunks.id, deleteDocsChunkIds))
	}

	// report the totals so a clean re-run reads "0 embedded, 0 deleted"
	console.log(
		`synced ${docsSections.length} docs sections: ${changedDocsSections.length} embedded, ${deleteDocsChunkIds.length} deleted`,
	)
}

// run the sync when invoked as a script, then close the pool so the process exits on its own
if (import.meta.main) {
	await syncDocsChunks()
	await connectionPool.end()
}
