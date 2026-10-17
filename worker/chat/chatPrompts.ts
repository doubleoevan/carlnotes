// the system prompt each chat reads, built from its template: the topic chat's, the team chat room's, and the
// new-topic chat's, with the blocks that fill them
import { toMaxTopicFindingsSentence, toScanFrequenciesSentence, toVisibilitiesSentence } from "@shared/enums"
import { toSourceOptionsSentence } from "@shared/sources"
import type { TopicDraft, TopicDraftTeam } from "@shared/topicPayloads"
import { type BuiltPrompt, fetchPromptTemplate } from "../prompts/fetch"
import { writePrompt } from "../prompts/write"
import type { ChatTurnInput } from "./chatMessages"
import type { ChatContext, RetrievedFinding, TopicSettings } from "./retrieve"
import type { TeamChatContext } from "./retrieveTeam"

// the edit block for a turn without the topic tools
const EMPTY_EDIT_TOPIC_BLOCK = "None."

// whether the chat turn's question was spoken, which splices the spoken fragment above the chat's closing rules
type ChatPromptOptions = { isSpoken?: boolean }

// the shared fragments with no variables, written once for every chat
type ChatFragmentName = "chat-conduct" | "chat-docs-guide" | "chat-open-new-topic" | "chat-spoken"

// the topic chat's turn options: the edit block for a turn with the topic tools, and the spoken flag
type TopicChatPromptOptions = ChatPromptOptions & { editTopicBlock?: string }

// the new-topic chat's options: the spoken flag, and what happened to the last proposal this turn
type NewTopicChatPromptOptions = ChatPromptOptions & { proposalOutcome?: string }

/**
 * Builds the system prompt from the 'chat-topic.md' template, with everything a user could have written fenced as data.
 */
export async function buildTopicChatPrompt(
	chatContext: ChatContext,
	{ editTopicBlock = EMPTY_EDIT_TOPIC_BLOCK, isSpoken = false }: TopicChatPromptOptions = {},
): Promise<BuiltPrompt> {
	const [
		{ template, name, registryPrompt },
		glossaryBlock,
		conductBlock,
		docsGuideBlock,
		openNewTopicBlock,
		spokenBlock,
	] = await Promise.all([
		fetchPromptTemplate("chat-topic"),
		toGlossaryBlock(TOPIC_CHAT_GLOSSARY_LINE),
		toFragmentBlock("chat-conduct"),
		toFragmentBlock("chat-docs-guide"),
		toFragmentBlock("chat-open-new-topic"),
		toSpokenBlock(isSpoken),
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
		{ editTopicBlock, glossaryBlock, conductBlock, docsGuideBlock, openNewTopicBlock, spokenBlock },
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
 * A shared fragment with no variables, written once for every chat: carl's conduct, how a chat reads the docs
 * sections, or what a chat does if a reader asks for a new topic.
 */
async function toFragmentBlock(fragmentName: ChatFragmentName): Promise<string> {
	const { template } = await fetchPromptTemplate(fragmentName)
	return writePrompt(template, {})
}

/**
 * What changes on a spoken chat turn, written once for every chat: the reply is read aloud, so it is short and has no
 * markup. A typed chat turn gets an empty block without a fetch.
 */
async function toSpokenBlock(isSpoken: boolean): Promise<string> {
	return isSpoken ? toFragmentBlock("chat-spoken") : ""
}

// the outcome line for a turn whose message answered no proposal
const NO_PROPOSAL_OUTCOME = "No proposal was waiting on this message."

/**
 * Returns the edit block for a turn with the topic tools: the saving tools' block in a room, the proposal block with
 * this turn's proposal outcome in a private chat, or "None." for a turn without the topic tools.
 */
export async function toEditTopicBlock(
	chatTurnInput: Pick<ChatTurnInput, "tools" | "proposeTopicEditTool" | "proposalOutcome">,
): Promise<string> {
	// a turn with neither the saving tools nor the preview tools reads the no-edit note
	if (!chatTurnInput.tools && !chatTurnInput.proposeTopicEditTool) {
		return EMPTY_EDIT_TOPIC_BLOCK
	}

	// the preview rules both blocks share, written first so each block splices them
	const [previewTopicEditFragment, editTopicFragment] = await Promise.all([
		fetchPromptTemplate("chat-preview-topic-edit"),
		fetchPromptTemplate(chatTurnInput.tools ? "chat-edit-topic" : "chat-propose-topic-edit"),
	])
	const previewTopicEditBlock = writePrompt(
		previewTopicEditFragment.template,
		{},
		{
			visibilities: toVisibilitiesSentence(),
			scanFrequencies: toScanFrequenciesSentence(),
			maxTopicFindings: toMaxTopicFindingsSentence(),
		},
	)

	// the room's block takes no proposal outcome, and writePrompt leaves a value no placeholder asks for unused
	const proposalOutcome = chatTurnInput.proposalOutcome ?? NO_PROPOSAL_OUTCOME
	return writePrompt(editTopicFragment.template, {}, { previewTopicEditBlock, proposalOutcome })
}

/**
 * Builds the new-topic chat's system prompt from 'chat-new-topic.md', with the docs and the draft fenced as data.
 */
export async function buildNewTopicChatPrompt(
	docsBlock: string,
	topicDraft?: TopicDraft,
	topicsRemaining?: number,
	leaderTeams?: TopicDraftTeam[],
	{ isSpoken = false, proposalOutcome = NO_PROPOSAL_OUTCOME }: NewTopicChatPromptOptions = {},
): Promise<BuiltPrompt> {
	const [{ template, name, registryPrompt }, glossaryBlock, docsGuideBlock, spokenBlock] = await Promise.all([
		fetchPromptTemplate("chat-new-topic"),
		toGlossaryBlock(NEW_TOPIC_CHAT_GLOSSARY_LINE),
		toFragmentBlock("chat-docs-guide"),
		toSpokenBlock(isSpoken),
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
			spokenBlock,
			scanFrequencies: toScanFrequenciesSentence(),
			maxTopicFindings: toMaxTopicFindingsSentence(),
			proposalOutcome,
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
export async function buildTeamChatPrompt(
	teamContext: TeamChatContext,
	{ isSpoken = false }: ChatPromptOptions = {},
): Promise<BuiltPrompt> {
	const [
		{ template, name, registryPrompt },
		glossaryBlock,
		conductBlock,
		docsGuideBlock,
		openNewTopicBlock,
		spokenBlock,
	] = await Promise.all([
		fetchPromptTemplate("chat-team"),
		toGlossaryBlock(TEAM_CHAT_GLOSSARY_LINE),
		toFragmentBlock("chat-conduct"),
		toFragmentBlock("chat-docs-guide"),
		toFragmentBlock("chat-open-new-topic"),
		toSpokenBlock(isSpoken),
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
		{ glossaryBlock, conductBlock, docsGuideBlock, openNewTopicBlock, spokenBlock },
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
