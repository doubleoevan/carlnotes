// the generation side of topic chat
import {
	CHAT_HISTORY_TURNS,
	type ChatAttachment,
	compactChatAnswer,
	type TopicDraft,
	type TopicDraftTeam,
	toUncompactedChatTurnStart,
} from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import {
	type ImagePart,
	type ModelMessage,
	type StreamTextTransform,
	stepCountIs,
	streamText,
	type TextPart,
	type TextStreamPart,
	type Tool,
	type ToolSet,
} from "ai"
import { chatModel } from "../models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "../prompts/fetch"
import { writePrompt } from "../prompts/write"
import {
	type ChatContext,
	type RetrievedFinding,
	retrieveChatContext,
	retrieveDocsBlock,
	retrieveTeamChatContext,
	type TeamChatContext,
} from "./retrieve"
import { type SearchTotal, webSearchTool } from "./search"

// how many model steps one chat turn search may take
const MAX_TURN_STEPS = 8

// the reply's token limit, bounding what one chat turn can spend on expensive output tokens
const MAX_TURN_OUTPUT_TOKENS = 3000

// one earlier chat turn, replayed so the model can resolve what "that" and "the second one" point back to
export type ChatHistoryTurn = { question: string; answer: string }

// everything one chat turn needs to answer a user's question about a topic, or about a team's whole topic set
export type ChatTurnInput = {
	topicId?: string
	// the team whose own chat room is asking, which reads across every topic the team holds
	teamId?: string
	question: string
	history: ChatHistoryTurn[]
	chatAttachments?: ChatAttachment[]
	// who is asking. chat is signed-in only, and this scopes their kept chat attachments
	userId: string
	// whether this user owns the topic, resolved by the authorization gate before the call
	isTopicOwner: boolean
	litellmApiKey?: string
	// false for a chat room turn, whose answer posts publicly, so the poster's kept chat attachments stay out
	includeAttachments?: boolean
	// what retrieval embeds instead of the question, for a chat room turn whose question is composed from the chat messages
	retrievalQuestion?: string
	// the tools this turn offers: the edit tools to a user who may edit the topic, the draft tools to the new-topic chat
	tools?: Record<string, Tool>
	// the new-topic chat, bound to no topic and no team, and the draft its turn was sent with
	newTopic?: boolean
	topicDraft?: TopicDraft
	// how many more topics the plan lets the user hold
	topicsRemaining?: number
	// the teams the user leads, which the new-topic chat may put the topic on
	leaderTeams?: TopicDraftTeam[]
}

// the edit block for a turn without the topic tools
const EMPTY_EDIT_TOPIC_BLOCK = "None."

// the streamed reply plus what it cost, resolved once the stream is fully read
export type ChatReplyStream = {
	textStream: AsyncIterable<string>
	completion: Promise<{ text: string; totalTokens: number; searchCount: number }>
}

/**
 * Streams one reply to a user's question about a topic, or null if the topic does not exist.
 */
export async function streamChatReply(input: ChatTurnInput): Promise<ChatReplyStream | null> {
	// a missing topic or team has nothing to chat about
	const chatContext = await retrieveReplyContext(input)
	if (!chatContext) {
		return null
	}
	// a template drift here throws an error, and nothing downstream would otherwise report it
	let chatPrompt: BuiltPrompt
	try {
		chatPrompt = await buildReplyPrompt(input, chatContext)
	} catch (error) {
		console.error(`chat prompt failed for ${input.teamId ? `team ${input.teamId}` : `topic ${input.topicId}`}`, error)
		reportError(error, "chat", { topicId: input.topicId ?? input.teamId ?? "" })
		throw error
	}
	// the system prompt is interpolated with the conversation sent as real messages
	const searchTotal: SearchTotal = { count: 0 }
	// one streamed completion. a consent with the tools on must call one, since a consent answers a proposal
	const replyStream = streamText({
		model: chatModel(input.litellmApiKey),
		system: chatPrompt.prompt,
		messages: toModelMessages(input.history, input.question, input.chatAttachments ?? []),
		tools: { searchWeb: webSearchTool(searchTotal), ...input.tools },
		prepareStep: ({ stepNumber }) =>
			stepNumber === 0 && input.tools && isConsent(input.question) ? { toolChoice: "required" } : undefined,
		maxOutputTokens: MAX_TURN_OUTPUT_TOKENS,
		stopWhen: stepCountIs(MAX_TURN_STEPS),
		// a paragraph break between text a tool call separates, in the stream and in the stored answer alike
		experimental_transform: breakTextAroundToolCalls(),
		...promptTelemetry(chatPrompt),
	})
	// stops an early failure here from crashing the process. it's still handled properly further down
	const completion = toCompletion(replyStream, searchTotal)
	completion.catch(() => {})
	return { textStream: replyStream.textStream, completion }
}

// the new-topic chat's context, the docs alone. it has no topic material to read
type NewTopicChatContext = { docsBlock: string }

// what the reply reads: the topic's own material, every topic a team holds, or the docs alone for the new-topic chat.
// null for a topic or team that does not exist
async function retrieveReplyContext(
	input: ChatTurnInput,
): Promise<ChatContext | TeamChatContext | NewTopicChatContext | null> {
	if (input.newTopic) {
		return { docsBlock: await retrieveDocsBlock(input.question, input.litellmApiKey) }
	}
	if (input.teamId) {
		return retrieveTeamChatContext(input.teamId, input.retrievalQuestion ?? input.question, input.litellmApiKey)
	}
	// retrieve the topic's context with its per-user reads
	return retrieveChatContext(
		input.topicId ?? "",
		input.retrievalQuestion ?? input.question,
		input.userId,
		// the owner flag scopes the topic's own attachments, and the keep flag the user's chat material
		input.isTopicOwner,
		input.litellmApiKey,
		input.includeAttachments ?? true,
	)
}

// the system prompt over the context: the new-topic chat's own template, the team chat room's, or the topic's
async function buildReplyPrompt(
	input: ChatTurnInput,
	chatContext: ChatContext | TeamChatContext | NewTopicChatContext,
): Promise<BuiltPrompt> {
	if (input.newTopic) {
		return buildNewTopicChatPrompt(chatContext.docsBlock, input.topicDraft, input.topicsRemaining, input.leaderTeams)
	}
	// retrieve every topic the team holds for the team chat room
	if (input.teamId) {
		return buildTeamChatPrompt(chatContext as TeamChatContext)
	}
	return buildTopicChatPrompt(chatContext as ChatContext, await toEditTopicBlock(input.tools))
}

// the short questions that consent to whatever carl last proposed
const CONSENT_PATTERN =
	/^(yes|yep|yeah|yup|sure|sure thing|ok|okay|do it|go ahead|go for it|create it|save it|make it|sounds good|perfect|let'?s do it|let'?s go|ship it|yes please|please do)[\s!.,]*$/i

/**
 * Reads whether a question is a consent, the kind that answers a proposal instead of asking anything.
 */
export function isConsent(question: string): boolean {
	return CONSENT_PATTERN.test(question.trim())
}

/**
 * The conversation as model messages, ending on the user's latest question and whatever they attached to it.
 */
export function toModelMessages(
	history: ChatHistoryTurn[],
	question: string,
	attachments: ChatAttachment[] = [],
): ModelMessage[] {
	// limit the history the api client sends, so no user can inflate what one chat turn costs
	const includedHistory = history.slice(-CHAT_HISTORY_TURNS)

	// the newest chat is returned word for word
	const uncompactedChatTurnStart = toUncompactedChatTurnStart(includedHistory)
	const conversation = includedHistory.flatMap((chatTurn, index): ModelMessage[] => [
		{ role: "user", content: chatTurn.question },
		{
			role: "assistant",
			content: index < uncompactedChatTurnStart ? compactChatAnswer(chatTurn.answer) : chatTurn.answer,
		},
	])
	return [...conversation, { role: "user", content: toUserContent(question, attachments) }]
}

// an attachment name flattened onto one line
function toAttachmentName(name: string): string {
	return name.replace(/\s+/g, " ").trim()
}

// the newest message's content
function toUserContent(question: string, attachments: ChatAttachment[]): string | (TextPart | ImagePart)[] {
	if (attachments.length === 0) {
		return question
	}
	// text attachments join the question in one text part, each attachment under the name the user gave it
	const textBlocks = attachments
		.filter((attachment) => attachment.kind === "text")
		.map((attachment) => `--- attached: ${toAttachmentName(attachment.name)} ---\n${attachment.text}`)
	// each image is its own part, so the model sees the picture instead of a mention of one
	const images = attachments
		.filter((attachment) => attachment.kind === "image")
		.map((attachment) => ({ type: "image" as const, image: attachment.dataUrl }))
	return [{ type: "text" as const, text: [question, ...textBlocks].join("\n\n") }, ...images]
}

// the assembled reply with its token and search counts, all of which resolve only once the chat stream is drained
async function toCompletion(
	replyStream: { text: PromiseLike<string>; usage: PromiseLike<{ totalTokens?: number }> },
	searchTotal: SearchTotal,
): Promise<{ text: string; totalTokens: number; searchCount: number }> {
	const usage = await replyStream.usage
	return { text: await replyStream.text, totalTokens: usage.totalTokens ?? 0, searchCount: searchTotal.count }
}

/**
 * Builds the system prompt from the 'chat-topic.md' template, with everything a user could have written fenced as data.
 */
export async function buildTopicChatPrompt(
	chatContext: ChatContext,
	editTopicBlock: string = EMPTY_EDIT_TOPIC_BLOCK,
): Promise<BuiltPrompt> {
	const { template, name, registryPrompt } = await fetchPromptTemplate("chat-topic")

	// fill the template, composing each list block first. the edit block is the app's own text and stays unfenced
	const prompt = writePrompt(
		template,
		{
			topicName: chatContext.topicName,
			topicPrompt: chatContext.topicPrompt || "Nothing written down yet.",
			findingsBlock: toFindingsBlock(chatContext.findings),
			sourcesBlock: toSourcesBlock(chatContext.sources),
			scanSummariesBlock: toScanSummariesBlock(chatContext.scanSummaries),
			attachmentContext: chatContext.attachmentContext || "None.",
			chatAttachmentContext: chatContext.chatAttachmentContext || "None.",
			docsBlock: chatContext.docsBlock || "None.",
		},
		{ editTopicBlock },
	)
	return { prompt, name, registryPrompt }
}

// the edit block for a turn with the topic tools, or "None." for a turn without them
async function toEditTopicBlock(tools: ChatTurnInput["tools"]): Promise<string> {
	if (!tools) {
		return EMPTY_EDIT_TOPIC_BLOCK
	}
	const { template } = await fetchPromptTemplate("chat-edit-topic")
	return writePrompt(template, {})
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
	const { template, name, registryPrompt } = await fetchPromptTemplate("chat-new-topic")
	// write the prompt with the docs, the topic draft, and the teams fenced as data and the plan's limit unfenced
	const prompt = writePrompt(
		template,
		{
			docsBlock: docsBlock || "None.",
			topicDraftBlock: toTopicDraftBlock(topicDraft),
			teamsBlock: toTeamsBlock(leaderTeams),
		},
		{ topicLimitBlock: toTopicLimitBlock(topicsRemaining) },
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
	const { template, name, registryPrompt } = await fetchPromptTemplate("chat-team")

	// fill the template, composing each list block first
	const prompt = writePrompt(template, {
		teamName: teamContext.teamName,
		topicsBlock: toTopicsBlock(teamContext.topics),
		findingsBlock: toFindingsBlock(teamContext.findings),
		sourcesBlock: toSourcesBlock(teamContext.sources),
		scanSummariesBlock: toScanSummariesBlock(teamContext.scanSummaries),
		docsBlock: teamContext.docsBlock || "None.",
	})
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

/**
 * Puts a paragraph break between text a tool call separates, as a delta of the later text block,
 * ahead of the SDK saving the text so the stored reply has the break too.
 */
export function breakTextAroundToolCalls(): StreamTextTransform<ToolSet> {
	return () => {
		// whether any text passed yet, and whether a tool call came after it with no text since
		let hasText = false
		let isBreakDue = false
		return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
			transform(part, controller) {
				// mark a break due after a tool call that follows text
				if (part.type === "tool-call") {
					isBreakDue = hasText
				}
				// put the break at the front of the first text after that call
				if (part.type === "text-delta" && part.text !== "") {
					hasText = true
					// the break goes at the front of this delta
					if (isBreakDue) {
						isBreakDue = false
						controller.enqueue({ ...part, text: `\n\n${part.text}` })
						return
					}
				}
				controller.enqueue(part)
			},
		})
	}
}
