// the system prompt each chat reads, built from its template: the topic chat's, the team chat room's, and the
// new-topic chat's, with the blocks that fill them
import { toScanFrequenciesSentence } from "@shared/enums"
import { toSourceOptionsSentence } from "@shared/sources"
import type { TopicDraft, TopicDraftTeam } from "@shared/topicPayloads"
import { type BuiltPrompt, fetchPromptTemplate } from "../prompts/fetch"
import { writePrompt } from "../prompts/write"
import type { ChatTurnInput } from "./chatMessages"
import type { ChatContext, RetrievedFinding, TopicSettings } from "./retrieve"
import type { TeamChatContext } from "./retrieveTeam"

// the edit block for a turn without the topic tools
const EMPTY_EDIT_TOPIC_BLOCK = "None."

/**
 * Builds the system prompt from the 'chat-topic.md' template, with everything a user could have written fenced as data.
 */
export async function buildTopicChatPrompt(
	chatContext: ChatContext,
	editTopicBlock: string = EMPTY_EDIT_TOPIC_BLOCK,
): Promise<BuiltPrompt> {
	const [{ template, name, registryPrompt }, glossaryBlock, conductBlock, docsGuideBlock, openNewTopicBlock] =
		await Promise.all([
			fetchPromptTemplate("chat-topic"),
			toGlossaryBlock(TOPIC_CHAT_GLOSSARY_LINE),
			toConductBlock(),
			toDocsGuideBlock(),
			toOpenNewTopicBlock(),
		])

	// fill the template, composing each list block first. the app's own blocks stay unfenced
	const prompt = writePrompt(
		template,
		{
			topicName: chatContext.topicName,
			topicPrompt: chatContext.topicPrompt || "Nothing written down yet.",
			topicSettingsBlock: toTopicSettingsBlock(chatContext.topicSettings),
			findingsBlock: toFindingsBlock(chatContext.findings),
			sourcesBlock: toSourcesBlock(chatContext.sources),
			scanSummariesBlock: toScanSummariesBlock(chatContext.scanSummaries),
			attachmentContext: chatContext.attachmentContext || "None.",
			chatAttachmentContext: chatContext.chatAttachmentContext || "None.",
			docsBlock: chatContext.docsBlock || "None.",
		},
		{ editTopicBlock, glossaryBlock, conductBlock, docsGuideBlock, openNewTopicBlock },
	)
	return { prompt, name, registryPrompt }
}

// the one glossary line each chat writes for itself
const TOPIC_CHAT_GLOSSARY_LINE =
	"**Coffee Talk** is this conversation. Following a topic puts its brews in a reader's feed and, if they want, their email."
const TEAM_CHAT_GLOSSARY_LINE =
	"**Coffee Talk** is this conversation. This room belongs to the whole team, so everything you say here is read by every member."
const NEW_TOPIC_CHAT_GLOSSARY_LINE = "**Coffee Talk** is this conversation."

/**
 * The glossary block every chat prompt shares, with the source options from the source registry.
 */
async function toGlossaryBlock(chatGlossaryLine: string): Promise<string> {
	const { template } = await fetchPromptTemplate("chat-glossary")
	return writePrompt(
		template,
		{},
		{
			sourceOptions: toSourceOptionsSentence(),
			scanFrequencies: toScanFrequenciesSentence(),
			chatGlossaryLine,
		},
	)
}

/**
 * Carl's voice and the rules every chat about findings shares, written once.
 */
async function toConductBlock(): Promise<string> {
	const { template } = await fetchPromptTemplate("chat-conduct")
	return writePrompt(template, {})
}

/**
 * How a chat reads the docs sections retrieved for the question, written once for every chat prompt.
 */
async function toDocsGuideBlock(): Promise<string> {
	const { template } = await fetchPromptTemplate("chat-docs-guide")
	return writePrompt(template, {})
}

/**
 * What a chat about findings does if a reader asks for a new topic, written once for the topic chat and the team room.
 */
async function toOpenNewTopicBlock(): Promise<string> {
	const { template } = await fetchPromptTemplate("chat-open-new-topic")
	return writePrompt(template, {})
}

/**
 * Returns the edit block for a turn with the topic tools, or "None." for a turn without the topic tools.
 */
export async function toEditTopicBlock(tools: ChatTurnInput["tools"]): Promise<string> {
	if (!tools) {
		return EMPTY_EDIT_TOPIC_BLOCK
	}
	const { template } = await fetchPromptTemplate("chat-edit-topic")
	return writePrompt(template, {}, { scanFrequencies: toScanFrequenciesSentence() })
}

/**
 * Builds the new-topic chat's system prompt from 'chat-new-topic.md', with the docs and the draft fenced as data.
 */
export async function buildNewTopicChatPrompt(
	docsBlock: string,
	topicDraft?: TopicDraft,
	topicsRemaining?: number,
	leaderTeams?: TopicDraftTeam[],
): Promise<BuiltPrompt> {
	const [{ template, name, registryPrompt }, glossaryBlock, docsGuideBlock] = await Promise.all([
		fetchPromptTemplate("chat-new-topic"),
		toGlossaryBlock(NEW_TOPIC_CHAT_GLOSSARY_LINE),
		toDocsGuideBlock(),
	])
	// write the prompt with the docs, the topic draft, and the teams fenced as data and the app's own blocks unfenced
	const prompt = writePrompt(
		template,
		{
			docsBlock: docsBlock || "None.",
			topicDraftBlock: toTopicDraftBlock(topicDraft),
			teamsBlock: toTeamsBlock(leaderTeams),
		},
		{
			topicLimitBlock: toTopicLimitBlock(topicsRemaining),
			glossaryBlock,
			docsGuideBlock,
			scanFrequencies: toScanFrequenciesSentence(),
		},
	)
	return { prompt, name, registryPrompt }
}

// whether any field the user can fill holds something
function isTopicDraftWritten(topicDraft: TopicDraft): boolean {
	return Boolean(
		topicDraft.name ||
			topicDraft.prompt ||
			topicDraft.sources.length > 0 ||
			topicDraft.tags.length > 0 ||
			topicDraft.inviteEmails.length > 0 ||
			topicDraft.team,
	)
}

// the draft as carl reads it, one line per field, or a plain line for a draft with nothing written yet
function toTopicDraftBlock(topicDraft?: TopicDraft): string {
	if (!topicDraft || !isTopicDraftWritten(topicDraft)) {
		return "Nothing written yet."
	}
	const topicSources = topicDraft.sources
		.map((topicSource) => `${topicSource.sourceOption} ${topicSource.value}`.trim())
		.join(", ")
	return [
		`Title: ${topicDraft.name || "(none yet)"}`,
		`Prompt: ${topicDraft.prompt || "(none yet)"}`,
		`Sources: ${topicSources || "(none yet)"}`,
		`Visibility: ${topicDraft.visibility}`,
		`Team: ${topicDraft.team?.name ?? "(none)"}`,
		`Tags: ${topicDraft.tags.join(", ") || "(none)"}`,
		`Brews: ${topicDraft.frequency}, keeping ${topicDraft.maxTopicFindings} findings each`,
		`Invites: ${topicDraft.inviteEmails.join(", ") || "(none)"}`,
	].join("\n")
}

// the topic's settings as carl reads them, one line each, in the words the draft block uses
function toTopicSettingsBlock(topicSettings: TopicSettings): string {
	const { frequency, scheduledTime, scheduledDayOfWeek, visibility, tags, maxTopicFindings } = topicSettings
	// only a weekly scan has a day, and the stored time drops its seconds
	const scanDay = frequency === "weekly" ? ` on ${scheduledDayOfWeek}` : ""
	return [
		`Visibility: ${visibility}`,
		`Tags: ${tags.join(", ") || "(none)"}`,
		`Brews: ${frequency}${scanDay} at ${scheduledTime.slice(0, 5)}, keeping ${maxTopicFindings} findings each`,
	].join("\n")
}

// the teams the user leads, one per line with the id draftTopic takes, or a plain line for none
function toTeamsBlock(leaderTeams?: TopicDraftTeam[]): string {
	if (!leaderTeams || leaderTeams.length === 0) {
		return "None."
	}
	return leaderTeams.map((leaderTeam) => `- ${leaderTeam.name} (teamId: ${leaderTeam.teamId})`).join("\n")
}

// how many more topics the plan allows, in the words carl passes on
function toTopicLimitBlock(topicsRemaining?: number): string {
	if (topicsRemaining === undefined) {
		return "This reader can make as many topics as they like."
	}
	// end the wizard before it starts when no topic is left
	if (topicsRemaining <= 0) {
		return "This reader has reached their plan's topic limit. Say so before anything else: no topic can be made until they pick up more room at carlnotes.com/plans or drop one on its page. Do not run the wizard."
	}
	return `This reader's plan has room for ${topicsRemaining} more ${topicsRemaining === 1 ? "topic" : "topics"}. Mention it when they are down to one.`
}

/**
 * Builds the team chat room's system prompt from the 'chat-team.md' template, reading across every topic the team holds.
 */
export async function buildTeamChatPrompt(teamContext: TeamChatContext): Promise<BuiltPrompt> {
	const [{ template, name, registryPrompt }, glossaryBlock, conductBlock, docsGuideBlock, openNewTopicBlock] =
		await Promise.all([
			fetchPromptTemplate("chat-team"),
			toGlossaryBlock(TEAM_CHAT_GLOSSARY_LINE),
			toConductBlock(),
			toDocsGuideBlock(),
			toOpenNewTopicBlock(),
		])

	// fill the template, composing each list block first. the app's own blocks stay unfenced
	const prompt = writePrompt(
		template,
		{
			teamName: teamContext.teamName,
			topicsBlock: toTopicsBlock(teamContext.topics),
			findingsBlock: toFindingsBlock(teamContext.findings),
			sourcesBlock: toSourcesBlock(teamContext.sources),
			scanSummariesBlock: toScanSummariesBlock(teamContext.scanSummaries),
			docsBlock: teamContext.docsBlock || "None.",
		},
		{ glossaryBlock, conductBlock, docsGuideBlock, openNewTopicBlock },
	)
	return { prompt, name, registryPrompt }
}

// each team topic's name with the prompt its owner wrote, or a plain line for a team with none
function toTopicsBlock(teamTopics: TeamChatContext["topics"]): string {
	if (teamTopics.length === 0) {
		return "This team holds no topics yet."
	}
	return teamTopics.map((topic) => `### ${topic.name}\n${topic.prompt || "Nothing written down yet."}`).join("\n\n")
}

// the findings as the model reads them, best-match first with recency breaking the near-ties
function toFindingsBlock(retrievedFindings: RetrievedFinding[]): string {
	if (retrievedFindings.length === 0) {
		return "No findings are indexed for this topic yet."
	}

	// each finding includes its own url
	return retrievedFindings
		.map((finding) =>
			[
				`### ${finding.topicName ? `[${finding.topicName}] ` : ""}${finding.title ?? finding.url}`,
				finding.url,
				`Found: ${finding.foundAt.toISOString().slice(0, 10)}`,
				`Relevance: ${finding.relevanceScore.toFixed(2)} — ${finding.relevanceExplanation}`,
				finding.text,
			].join("\n"),
		)
		.join("\n\n")
}

// the places this topic reads, one per line, or a plain line saying it has no sources
function toSourcesBlock(topicSources: string[]): string {
	if (topicSources.length === 0) {
		return "No sources are set up for this topic yet."
	}
	return topicSources.join("\n")
}

// the recent scan summaries, newest first, or a plain line saying there are none
function toScanSummariesBlock(scanSummaries: string[]): string {
	if (scanSummaries.length === 0) {
		return "No scan notes yet."
	}
	return scanSummaries.join("\n\n")
}
