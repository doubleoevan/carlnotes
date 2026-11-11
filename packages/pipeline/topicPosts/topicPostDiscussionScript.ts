// a Topic Post Discussion's script: the prompt, the model call that writes a draft, the checks a draft passes in code,
// and the retry that writes drafts until one passes

import { type PodcastEpisodeTurn, podcastEpisodeTurnPayload } from "@carlnotes/contracts/payloads"
import { toTranscriptText } from "@carlnotes/contracts/podcastEpisodes"
import { toSharedCommentLine } from "@carlnotes/contracts/socialText"
import { toHtmlText, toOneLineText } from "@carlnotes/contracts/text"
import { toWordCount } from "@carlnotes/contracts/topicPosts"
import { premiumModelCost } from "@carlnotes/models/budget"
import { LOW_REASONING_PROVIDER_OPTIONS, scoreModel } from "@carlnotes/models/models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText, Output } from "ai"
import { z } from "zod"
import { throwScriptDraftError, writeCheckedScriptDraft } from "../podcast/generatePodcastEpisodeScript"
import { toPodcastEpisodeHostsBlock } from "../podcast/podcastEpisodeHosts"
import { isUsernameSpoken, RejectedScriptError } from "../podcast/podcastEpisodeScript"

// how many words the hosts speak in a minute, and the longest a discussion runs, which is under a Podcast Episode's
// shortest length
const WORDS_PER_MINUTE = 150
const MAX_DISCUSSION_MINUTES = 7

// a discussion of the post alone holds half as many words as the post, between two and four minutes
const POST_WORDS_PER_DISCUSSION_WORD = 2
const MIN_POST_DISCUSSION_WORDS = 300
const MAX_POST_DISCUSSION_WORDS = 600

// the words each read Comment's exchange adds, which is half a minute, and the share of the most words a prompt
// asks for at the least
const COMMENT_EXCHANGE_WORDS = 75
const MIN_DISCUSSION_WORD_SHARE = 0.75

// the most words any discussion may hold, which is seven minutes at the hosts' speaking rate
export const MAX_DISCUSSION_WORDS = MAX_DISCUSSION_MINUTES * WORDS_PER_MINUTE

// how much of a post's text, and how many Comments, one prompt holds
const MAX_DISCUSSION_POST_CHARS = 16_000
export const MAX_DISCUSSION_COMMENTS = 6

// what a prompt says in place of an input it has none of
const NO_INPUT = "none"

// what the hosts call an author whose username is not said aloud
export const UNNAMED_AUTHOR = "the author"

// what one discussion call writes: the turns the two hosts say
export const topicPostDiscussionPayload = z.object({ turns: z.array(podcastEpisodeTurnPayload).min(2) })

// a Comment the hosts may read: its commenter's username and what they wrote
export type DiscussionComment = { username: string; body: string }

// what a discussion is written from: the post's title and stored body, its author's username or null for an author
// the hosts do not name, the Comments to read, the starter's note, and the litellm key to bill
export type TopicPostDiscussionInput = {
	title: string
	html: string
	authorUsername: string | null
	comments: DiscussionComment[]
	hint?: string
	litellmApiKey?: string
}

/**
 * Builds the discussion prompt, with the post, its title, its author, the Comments, the note, and the last draft's
 * rejection each fenced as untrusted, and the post limited in length.
 */
export async function buildTopicPostDiscussionPrompt(
	{ title, html, authorUsername, comments, hint }: TopicPostDiscussionInput,
	rejectionReason?: string,
): Promise<BuiltPrompt> {
	// the length the prompt asks for, from the whole post and the Comments the hosts read
	const postText = toHtmlText(html)
	const { minWordCount, maxWordCount } = toDiscussionWordCounts({ html, comments })
	const { template, registryPrompt } = await fetchPromptTemplate("write-topic-post-discussion")
	const prompt = writePrompt(
		template,
		{
			title: toOneLineText(title),
			author: authorUsername ?? UNNAMED_AUTHOR,
			post: postText.slice(0, MAX_DISCUSSION_POST_CHARS),
			commentsBlock: comments.length > 0 ? comments.map(toSharedCommentLine).join("\n") : NO_INPUT,
			hint: hint?.trim() || NO_INPUT,
			rejectionReason: rejectionReason ?? NO_INPUT,
		},
		{
			hostsBlock: await toPodcastEpisodeHostsBlock(),
			minWords: String(minWordCount),
			maxWords: String(maxWordCount),
		},
	)
	return { prompt, name: "write-topic-post-discussion", registryPrompt }
}

/**
 * Writes a discussion's turns on the given key, draft by draft until one passes its checks. Returns the turns with
 * what every draft cost together. Throws a RejectedScriptError if the last draft fails a check.
 */
export async function writeTopicPostDiscussion(
	topicPostDiscussionInput: TopicPostDiscussionInput,
): Promise<{ turns: PodcastEpisodeTurn[]; costDollars: number }> {
	// each draft's cost counts, whether or not the draft passes
	let costDollars = 0
	const usernames = topicPostDiscussionInput.comments.map((discussionComment) => discussionComment.username)
	const { maxWordCount } = toDiscussionWordCounts(topicPostDiscussionInput)
	const turns = await writeCheckedScriptDraft(async ({ rejectionReason, isLastScriptDraft }) => {
		// write one draft, with why the draft before it was rejected
		const discussionPrompt = await buildTopicPostDiscussionPrompt(topicPostDiscussionInput, rejectionReason)
		const { output: discussionDraft, usage } = await generateText({
			model: scoreModel(topicPostDiscussionInput.litellmApiKey),
			output: Output.object({ schema: topicPostDiscussionPayload }),
			prompt: discussionPrompt.prompt,
			providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
			...promptTelemetry(discussionPrompt),
		}).catch(throwScriptDraftError)
		costDollars += premiumModelCost(usage)
		return toCheckedDiscussionTurns({ turns: discussionDraft.turns, usernames, maxWordCount, isLastScriptDraft })
	})
	return { turns, costDollars }
}

// a draft's turns, the usernames of the Comments it was given to read, the most words its prompt asked for, and
// whether it is the call's last draft
type ToCheckedDiscussionTurnsOptions = {
	turns: PodcastEpisodeTurn[]
	usernames: string[]
	maxWordCount: number
	isLastScriptDraft: boolean
}

/**
 * Returns a draft's turns if both hosts speak, the script stays inside seven minutes, and every Comment it was given
 * is credited by its commenter's username as a whole word. Throws a RejectedScriptError that says what failed. A last
 * draft that leaves a Comment uncredited passes.
 */
export function toCheckedDiscussionTurns({
	turns,
	usernames,
	maxWordCount,
	isLastScriptDraft,
}: ToCheckedDiscussionTurnsOptions): PodcastEpisodeTurn[] {
	// both hosts speak
	const speakers = new Set(turns.map((turn) => turn.speaker))
	if (speakers.size < 2) {
		throw new RejectedScriptError("only one host speaks. both hosts must speak")
	}

	// the script stays inside seven minutes at the hosts' speaking rate
	const spokenText = turns.map((turn) => toTranscriptText(turn.text)).join(" ")
	const wordCount = toWordCount(spokenText)
	if (wordCount > MAX_DISCUSSION_WORDS) {
		throw new RejectedScriptError(`the script has ${wordCount} words. write at most ${maxWordCount}`)
	}

	// each Comment given is credited by name
	const uncreditedUsernames = usernames.filter((username) => !isUsernameSpoken(spokenText, username))
	if (uncreditedUsernames.length > 0 && !isLastScriptDraft) {
		throw new RejectedScriptError(
			`these commenters are not named: ${uncreditedUsernames.join(", ")}. say each username exactly as written`,
		)
	}
	return turns
}

/**
 * Returns the fewest and the most words a discussion's prompt asks for. A longer post and each Comment the hosts
 * read make the discussion longer, and it never runs past seven minutes.
 */
export function toDiscussionWordCounts({ html, comments }: Pick<TopicPostDiscussionInput, "html" | "comments">): {
	minWordCount: number
	maxWordCount: number
} {
	// the post's own share: half its length, between two and four minutes
	const halfPostWordCount = Math.round(toWordCount(toHtmlText(html)) / POST_WORDS_PER_DISCUSSION_WORD)
	const postDiscussionWordCount = Math.min(
		MAX_POST_DISCUSSION_WORDS,
		Math.max(MIN_POST_DISCUSSION_WORDS, halfPostWordCount),
	)

	// one short exchange for each Comment, and the fewest words as a round share of the most
	const commentsWordCount = comments.length * COMMENT_EXCHANGE_WORDS
	const maxWordCount = Math.min(MAX_DISCUSSION_WORDS, postDiscussionWordCount + commentsWordCount)
	return { minWordCount: Math.round((maxWordCount * MIN_DISCUSSION_WORD_SHARE) / 10) * 10, maxWordCount }
}
