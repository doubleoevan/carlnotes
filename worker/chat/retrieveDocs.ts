// the docs sections retrieved into a chat reply if a question asks about the app, and the embedding of a question or a
// search query with the query instruction
import { DOCS_SITE_ADDRESS } from "@shared/seo"
import { and, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { docsChunks } from "../../db/schema/chat"
import { EMBED_MODEL_NAME } from "../../db/schema/scans"
import { embedVector } from "../models"

// qwen3 is instruction-aware
const EMBED_QUERY_INSTRUCTION = "Given a user's question about a topic, retrieve web resources that answer it"

// how many docs sections one chat turn may quote and how relevant they have to be
const MAX_RETRIEVED_DOCS_SECTIONS = 3

const DOCS_MATCH_MAX_DISTANCE = 0.5

/**
 * Embeds a question or a search query with the query instruction.
 */
export function embedRetrievalQuery(query: string, litellmApiKey?: string): Promise<number[]> {
	return embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${query}`, litellmApiKey)
}

/**
 * Returns the docs sections close enough to the question to quote, composed into one block.
 */
export async function readDocsBlock(questionVector: number[]): Promise<string> {
	// keep only the sections within the cutoff, closest first, and limit how many one chat turn quotes
	const rows = await db
		.select({ page: docsChunks.page, content: docsChunks.content })
		.from(docsChunks)
		.where(
			and(
				eq(docsChunks.embeddingModel, EMBED_MODEL_NAME),
				sql`${docsChunks.embedding} <=> ${JSON.stringify(questionVector)}::vector < ${DOCS_MATCH_MAX_DISTANCE}`,
			),
		)
		.orderBy(sql`${docsChunks.embedding} <=> ${JSON.stringify(questionVector)}::vector`)
		.limit(MAX_RETRIEVED_DOCS_SECTIONS)

	return toDocsBlock(rows)
}

/**
 * Returns the docs sections as one block, each labeled with the docs url that the section came from.
 */
export function toDocsBlock(docsSections: { page: string; content: string }[]): string {
	return docsSections
		.map(
			(docsSection) =>
				`[${DOCS_SITE_ADDRESS}${docsSection.page === "index" ? "" : `/${docsSection.page}`}]\n${docsSection.content}`,
		)
		.join("\n\n")
}

/**
 * Builds the docs block alone for the new-topic chat, which has no topic material to read.
 */
export async function retrieveDocsBlock(question: string, litellmApiKey?: string): Promise<string> {
	const questionVector = await embedRetrievalQuery(question, litellmApiKey)
	return readDocsBlock(questionVector)
}
