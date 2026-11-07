// the text of a Comment: the plain text a write stores, the users it mentions, the urls it holds, and the parts a
// thread renders a body in
import { z } from "zod"
import { toCanonicalUrl } from "./canonicalUrl"
import { CHAT_MENTION_PATTERN } from "./chatMentions"
import { personalSourcesCandidateUrl, toTextUrls } from "./personalSourcesUrls"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "./podcastEpisodes"
import { toOneLineText } from "./text"
import { toNormalizedUsername } from "./usernames"

// the longest body a Comment holds
export const COMMENT_MAX_CHARS = 2000

// how much text a write reads before it rejects the request, far past the limit
const SOCIAL_TEXT_INPUT_MAX_CHARS = 20_000

// a control character other than a tab, a line feed, or a carriage return
// biome-ignore lint/suspicious/noControlCharactersInRegex: the pattern exists to find control characters
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/

// an html tag, which also matches a forged untrusted-data delimiter
const MARKUP_PATTERN = /<\/?[a-zA-Z][^<>]*>/g

// three or more line breaks in a row
const BLANK_LINES_PATTERN = /\n{3,}/g

/**
 * Returns the plain text a Comment stores: no markup, no forged delimiter, and its line breaks kept, with at most one
 * blank line between paragraphs.
 */
function toCommentText(text: string): string {
	// a line is cut and rejoined so a long run of spaces costs no regex backtracking
	const lines = text.replace(MARKUP_PATTERN, "").replace(/\r\n?/g, "\n").split("\n")
	return lines
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(BLANK_LINES_PATTERN, "\n\n")
		.trim()
}

// a Comment's body: a control character is rejected, and the plain text has from one character to the limit
export const commentBody = z
	.string()
	.max(SOCIAL_TEXT_INPUT_MAX_CHARS)
	.refine((text) => !CONTROL_CHARACTER_PATTERN.test(text))
	.transform(toCommentText)
	.pipe(z.string().min(1).max(COMMENT_MAX_CHARS))

// how many of a shared Comment's urls a Scan reviews
const COMMENT_LINK_LIMIT = 5

/**
 * Returns the distinct urls in a Comment's body that a Scan may fetch, each in its canonical form, in the order they
 * appear, up to the limit.
 */
export function toCommentLinkUrls(body: string): string[] {
	const urls = new Set<string>()
	for (const url of toTextUrls(body)) {
		// a Scan fetches only a public link
		const candidateUrl = personalSourcesCandidateUrl.safeParse(url)
		if (candidateUrl.success) {
			urls.add(toCanonicalUrl(candidateUrl.data))
		}
	}
	return [...urls].slice(0, COMMENT_LINK_LIMIT)
}

/**
 * Returns a shared Comment as one line of a prompt, under its author's name. A Comment with no author is Carl's.
 */
export function toSharedCommentLine({ username, body }: { username: string | null; body: string }): string {
	return `${username ?? PODCAST_EPISODE_SPEAKER_NAMES.host}: ${toOneLineText(body)}`
}

/**
 * Returns the distinct usernames a body mentions, normalized, in the order they appear. An @ inside a longer token,
 * like an email address, mentions nobody.
 */
export function toMentionedUsernames(body: string): string[] {
	return [
		...new Set(Array.from(body.matchAll(CHAT_MENTION_PATTERN), (mention) => toNormalizedUsername(mention[2] ?? ""))),
	]
}

// one stored mention: the user, and the name as the body wrote it
export const commentMention = z.object({ userId: z.string(), username: z.string() })
export type CommentMention = z.infer<typeof commentMention>

// one part of a rendered body: plain text, or a stored mention that links to its user
export type CommentBodyPart = { text: string; mentionedUserId: string | null }

/**
 * Returns a body as the parts a thread renders: each stored mention as its own part naming its user, and the text
 * between them. A name that no stored mention holds stays plain text.
 */
export function toCommentBodyParts(body: string, mentions: CommentMention[]): CommentBodyPart[] {
	// the stored mentions by normalized name, the way the write matched them
	const userIdsByUsername = new Map(mentions.map((mention) => [toNormalizedUsername(mention.username), mention.userId]))

	// walk the mentions in order, keeping the text before each one
	const commentBodyParts: CommentBodyPart[] = []
	let partStart = 0
	for (const mention of body.matchAll(CHAT_MENTION_PATTERN)) {
		// skip a name that no stored mention holds
		const mentionedUserId = userIdsByUsername.get(toNormalizedUsername(mention[2] ?? ""))
		if (!mentionedUserId) {
			continue
		}

		// the mention starts after the character the pattern matched before the @
		const mentionStart = mention.index + (mention[1]?.length ?? 0)
		const mentionEnd = mention.index + mention[0].length
		if (mentionStart > partStart) {
			commentBodyParts.push({ text: body.slice(partStart, mentionStart), mentionedUserId: null })
		}
		commentBodyParts.push({ text: body.slice(mentionStart, mentionEnd), mentionedUserId })
		partStart = mentionEnd
	}

	// keep the text after the last mention
	if (partStart < body.length) {
		commentBodyParts.push({ text: body.slice(partStart), mentionedUserId: null })
	}
	return commentBodyParts
}
