// the context a team chat room turn reads: the team's topics' findings, sources, and scan summaries
import { toSourceSummary } from "@shared/sources"
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "../../db"
import { scans } from "../../db/schema/scans"
import { teams, teamTopics } from "../../db/schema/teams"
import { sources, topics } from "../../db/schema/topics"
import { embedVector } from "../models"
import { MAX_SCAN_SUMMARIES, type RetrievedFinding, retrieveFindings } from "./retrieve"
import { EMBED_QUERY_INSTRUCTION, readDocsBlock } from "./retrieveDocs"

// everything one team chat room turn puts in front of the model, drawn from every topic the team holds
export type TeamChatContext = {
	teamName: string
	// each held topic's name and prompt, for the prompt's topics block
	topics: { name: string; prompt: string }[]
	findings: RetrievedFinding[]
	// the held topics' sources, each line naming its topic
	sources: string[]
	scanSummaries: string[]
	docsBlock: string
}

/**
 * Assembles one team chat room turn's context from every topic the team holds, or null if the team does not exist.
 */
export async function retrieveTeamChatContext(
	teamId: string,
	question: string,
	litellmApiKey?: string,
): Promise<TeamChatContext | null> {
	// a missing team has nothing to chat about
	const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId))
	if (!team) {
		return null
	}

	// the team's owned topics
	const ownedTopicRows = await db
		.select({ id: topics.id, name: topics.name, prompt: topics.prompt })
		.from(topics)
		.where(eq(topics.teamId, teamId))
	// the team's shared topics
	const sharedTopicRows = await db
		.select({ id: topics.id, name: topics.name, prompt: topics.prompt })
		.from(teamTopics)
		.innerJoin(topics, eq(topics.id, teamTopics.topicId))
		.where(eq(teamTopics.teamId, teamId))
	// the topicIds list that drives the topic reads. the topicNameByTopicId map labels each finding and source line
	const teamTopicRows = [...ownedTopicRows, ...sharedTopicRows]
	const topicIds = teamTopicRows.map((topicRow) => topicRow.id)
	const topicNameByTopicId = new Map(teamTopicRows.map((topicRow) => [topicRow.id, topicRow.name]))

	// embed the question once, then rank every held topic's findings against it together
	const questionVector = await embedVector(`Instruct: ${EMBED_QUERY_INSTRUCTION}\nQuery: ${question}`, litellmApiKey)
	const [retrievedFindings, teamSources, scanSummaries, docsBlock] = await Promise.all([
		topicIds.length > 0 ? retrieveFindings(topicIds, questionVector, topicNameByTopicId) : Promise.resolve([]),
		topicIds.length > 0 ? readTeamSources(topicIds, topicNameByTopicId) : Promise.resolve([]),
		topicIds.length > 0 ? readTeamScanSummaries(topicIds) : Promise.resolve([]),
		readDocsBlock(questionVector),
	])
	return {
		teamName: team.name,
		topics: teamTopicRows.map((topicRow) => ({ name: topicRow.name, prompt: topicRow.prompt })),
		findings: retrievedFindings,
		sources: teamSources,
		scanSummaries,
		docsBlock,
	}
}

// every topic's ready sources in one query, each line prefixed with its topic's name
async function readTeamSources(topicIds: string[], topicNameById: Map<string, string>): Promise<string[]> {
	const topicSourceRows = await db
		.select({ topicId: sources.topicId, sourceKind: sources.kind, config: sources.config })
		.from(sources)
		.where(and(inArray(sources.topicId, topicIds), eq(sources.status, "ready")))

	// the built-in web search stores nothing worth summarizing, so it names itself
	return topicSourceRows.map((topicSourceRow) => {
		const topicName = topicNameById.get(topicSourceRow.topicId) ?? "a topic"
		if (topicSourceRow.sourceKind === "search") {
			return `${topicName}: web search — Carl searches the live web for this topic`
		}
		// every other source keeps the topic page's own summary line
		const sourceSummary = toSourceSummary(topicSourceRow.sourceKind, topicSourceRow.config)
		return `${topicName}: ${sourceSummary ? `${topicSourceRow.sourceKind} — ${sourceSummary}` : topicSourceRow.sourceKind}`
	})
}

// the held topics' most recent scan summaries together, newest first
async function readTeamScanSummaries(topicIds: string[]): Promise<string[]> {
	const summaryRows = await db
		.select({ scanSummary: scans.scanSummary })
		.from(scans)
		.where(and(inArray(scans.topicId, topicIds), isNotNull(scans.scanSummary)))
		.orderBy(desc(scans.startedAt))
		.limit(MAX_SCAN_SUMMARIES)

	// drop the empty summaries so a blank summary adds no noise
	return summaryRows.map((summaryRow) => summaryRow.scanSummary ?? "").filter((summary) => summary.length > 0)
}
