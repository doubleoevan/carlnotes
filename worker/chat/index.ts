// the generation side of topic chat
import {
	CHAT_HISTORY_TURNS,
	type ChatAttachment,
	type ChatToolCall,
	compactChatAnswer,
	type TopicDraft,
	type TopicDraftTeam,
	toStandingTopicEditCall,
	toUncompactedChatTurnStart,
} from "@shared/contracts"
import { toScanFrequenciesSentence } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { toSourceOptionsSentence } from "@shared/sources"
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
	type TopicSettings,
} from "./retrieve"
import { type SearchTotal, webSearchTool } from "./search"

// how many model steps one chat turn search may take
const MAX_TURN_STEPS = 8

// the reply's token limit, bounding what one chat turn can spend on expensive output tokens
const MAX_TURN_OUTPUT_TOKENS = 3000

// one earlier chat turn, replayed so the model can resolve what "that" and "the second one" point back to
export type ChatHistoryTurn = { question: string; answer: string; toolCalls?: ChatToolCall[] }

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
	// the tools that save nothing, all bound outside tools so a consent's forced call can never pick one:
	// open the new-topic chat, show a proposed change on the topic's card, take it back off, and suggest sources
	openNewTopicChatTool?: Tool
	proposeTopicEditTool?: Tool
	cancelTopicEditTool?: Tool
	suggestSourcesTool?: Tool
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

// one part of a streamed reply: text as it arrives, or a tool call that returned
export type ChatReplyPart = { type: "text"; text: string } | { type: "tool-result"; toolCall: ChatToolCall }

// the streamed reply plus what it cost, resolved once the stream is fully read
export type ChatReplyStream = {
	replyParts: AsyncIterable<ChatReplyPart>
	completion: Promise<{ text: string; totalTokens: number; searchCount: number; toolCalls: ChatToolCall[] }>
}

/**
 * Streams one reply to a user's question about a topic, or null if the topic does not exist.
 */
export async function streamChatReply(input: ChatTurnInput): Promise<ChatReplyStream | null> {
	// catch a failed read or a template drift here
	let chatContext: ChatContext | TeamChatContext | NewTopicChatContext | null
	let chatPrompt: BuiltPrompt
	try {
		// return null when there is no topic or team to chat about
		chatContext = await retrieveReplyContext(input)
		if (!chatContext) {
			return null
		}
		chatPrompt = await buildReplyPrompt(input, chatContext)
	} catch (error) {
		// report the failure, then rethrow
		console.error(`chat reply failed for ${input.teamId ? `team ${input.teamId}` : `topic ${input.topicId}`}`, error)
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
		tools: {
			searchWeb: webSearchTool(searchTotal),
			...(input.openNewTopicChatTool ? { openNewTopicChat: input.openNewTopicChatTool } : {}),
			...(input.proposeTopicEditTool ? { proposeTopicEdit: input.proposeTopicEditTool } : {}),
			...(input.cancelTopicEditTool ? { cancelTopicEdit: input.cancelTopicEditTool } : {}),
			...(input.suggestSourcesTool ? { suggestSources: input.suggestSourcesTool } : {}),
			...input.tools,
		},
		prepareStep: ({ stepNumber }) => toConsentStep(stepNumber, input, input.tools),
		maxOutputTokens: MAX_TURN_OUTPUT_TOKENS,
		stopWhen: stepCountIs(MAX_TURN_STEPS),
		// a paragraph break between text a tool call separates, in the stream and in the stored answer alike
		experimental_transform: breakTextAroundToolCalls(),
		...promptTelemetry(chatPrompt),
	})
	// stops an early failure here from crashing the process. it's still handled properly further down
	const completion = toCompletion(replyStream, searchTotal)
	completion.catch(() => {})
	return { replyParts: toReplyParts(replyStream.stream), completion }
}

// the text and the tool results out of the model's full stream, in the order they arrive
async function* toReplyParts(modelStream: AsyncIterable<TextStreamPart<ToolSet>>): AsyncGenerator<ChatReplyPart> {
	for await (const streamPart of modelStream) {
		// forward the text and each tool result
		if (streamPart.type === "text-delta") {
			yield { type: "text", text: streamPart.text }
		} else if (streamPart.type === "tool-result") {
			yield { type: "tool-result", toolCall: toChatToolCall(streamPart) }
		}
		// throw an error part. the full stream yields one instead of throwing
		if (streamPart.type === "error") {
			throw streamPart.error
		}
	}
}

// one tool result as the call it records. a tool that returned nothing records "null"
function toChatToolCall(toolResult: { toolName: string; input: unknown; output: unknown }): ChatToolCall {
	return {
		toolName: toolResult.toolName,
		input: toolResult.input,
		output: typeof toolResult.output === "string" ? toolResult.output : (JSON.stringify(toolResult.output) ?? "null"),
	}
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

/**
 * Restricts a consent's first step to the tools that save, and leaves every other step unrestricted.
 * Only a yes that answers a change Carl proposed is restricted, so a yes to any other question never forces a save.
 */
export function toConsentStep(
	stepNumber: number,
	chatTurn: Pick<ChatTurnInput, "question" | "history">,
	savingTools: ChatTurnInput["tools"],
): { toolChoice: "required"; activeTools: string[] } | undefined {
	if (stepNumber !== 0 || !savingTools || !isConsent(chatTurn.question) || !isTopicEditProposed(chatTurn.history)) {
		return undefined
	}
	// name the tools that save. an empty set leaves the step unrestricted
	const savingToolNames = Object.keys(savingTools)
	return savingToolNames.length > 0 ? { toolChoice: "required", activeTools: savingToolNames } : undefined
}

// whether carl's last proposal is still standing, which is what a yes answers
export function isTopicEditProposed(history: ChatHistoryTurn[]): boolean {
	return toStandingTopicEditCall(history.flatMap((chatTurn) => chatTurn.toolCalls ?? [])) !== null
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
	const conversation = includedHistory.flatMap((chatTurn, index): ModelMessage[] => {
		// compact an older chat turn to its opening, without its tool calls
		if (index < uncompactedChatTurnStart) {
			return [
				{ role: "user", content: chatTurn.question },
				{ role: "assistant", content: compactChatAnswer(chatTurn.answer) },
			]
		}
		return [{ role: "user", content: chatTurn.question }, ...toAnswerModelMessages(chatTurn, index)]
	})
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

// how a chat turn answered, its tool calls with what they returned, then its words. a chat turn that called no tool
// is one assistant message. the stored calls keep no step of their own, so calls across steps replay as one batch
function toAnswerModelMessages(chatTurn: ChatHistoryTurn, chatTurnIndex: number): ModelMessage[] {
	const toolCalls = chatTurn.toolCalls ?? []
	if (toolCalls.length === 0) {
		return [{ role: "assistant", content: chatTurn.answer }]
	}
	// key each tool call by its place in the conversation. the stored calls keep no id of their own, and a
	// provider rejects a request where two calls share one id
	const toolCallIds = toolCalls.map((_toolCall, index) => `${chatTurnIndex}-${index}`)
	return [
		{
			role: "assistant",
			content: toolCalls.map((toolCall, index) => ({
				type: "tool-call" as const,
				toolCallId: toolCallIds[index] ?? `${index}`,
				toolName: toolCall.toolName,
				input: toolCall.input,
			})),
		},
		{
			role: "tool",
			content: toolCalls.map((toolCall, index) => ({
				type: "tool-result" as const,
				toolCallId: toolCallIds[index] ?? `${index}`,
				toolName: toolCall.toolName,
				output: { type: "text" as const, value: toolCall.output },
			})),
		},
		{ role: "assistant", content: chatTurn.answer },
	]
}

// the assembled reply with its token and search counts, all of which resolve only once the chat stream is read
async function toCompletion(
	replyStream: {
		text: PromiseLike<string>
		usage: PromiseLike<{ totalTokens?: number }>
		toolResults: PromiseLike<{ toolName: string; input: unknown; output: unknown }[]>
	},
	searchTotal: SearchTotal,
): Promise<{ text: string; totalTokens: number; searchCount: number; toolCalls: ChatToolCall[] }> {
	const usage = await replyStream.usage
	// collect every tool the chat turn called, with its input and output
	const toolCalls = (await replyStream.toolResults).map(toChatToolCall)
	return {
		text: await replyStream.text,
		totalTokens: usage.totalTokens ?? 0,
		searchCount: searchTotal.count,
		toolCalls,
	}
}

/**
 * Builds the system prompt from the 'chat-topic.md' template, with everything a user could have written fenced as data.
 */
export async function buildTopicChatPrompt(
	chatContext: ChatContext,
	editTopicBlock: string = EMPTY_EDIT_TOPIC_BLOCK,
): Promise<BuiltPrompt> {
	const [{ template, name, registryPrompt }, glossaryBlock, conductBlock] = await Promise.all([
		fetchPromptTemplate("chat-topic"),
		toGlossaryBlock(TOPIC_CHAT_GLOSSARY_LINE),
		toConductBlock(),
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
		{ editTopicBlock, glossaryBlock, conductBlock },
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

// the edit block for a turn with the topic tools, or "None." for a turn without them
async function toEditTopicBlock(tools: ChatTurnInput["tools"]): Promise<string> {
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
	const [{ template, name, registryPrompt }, glossaryBlock] = await Promise.all([
		fetchPromptTemplate("chat-new-topic"),
		toGlossaryBlock(NEW_TOPIC_CHAT_GLOSSARY_LINE),
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
	const [{ template, name, registryPrompt }, glossaryBlock, conductBlock] = await Promise.all([
		fetchPromptTemplate("chat-team"),
		toGlossaryBlock(TEAM_CHAT_GLOSSARY_LINE),
		toConductBlock(),
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
		{ glossaryBlock, conductBlock },
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
