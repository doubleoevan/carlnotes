// the helpers that read a model's reply for its links, its prose paragraphs, and the text of its steps
import { DOCS_SITE_ADDRESS } from "@shared/seo"

// a docs section's label line in a docs block, which names the docs page that the section came from
const DOCS_LABEL_PATTERN = new RegExp(`^\\[(${DOCS_SITE_ADDRESS.replaceAll(".", "\\.")}[^\\]]*)\\]$`, "gm")

// a chat reply, the findings' urls that the reply may link, and the docs sections that the chat was given
type ToDisallowedLinkUrlOptions = { replyText: string; findingUrls: string[]; docsBlock: string }

/**
 * Returns the first link in a chat reply that is neither a finding's url, the docs root, nor a page in the docs block.
 */
export function toDisallowedLinkUrl({
	replyText,
	findingUrls,
	docsBlock,
}: ToDisallowedLinkUrlOptions): string | undefined {
	// the docs pages that the docs block labels, and the docs root that every chat may point a user at
	const docsBlockPages = [...docsBlock.matchAll(DOCS_LABEL_PATTERN)].map((docsLabelMatch) => docsLabelMatch[1] ?? "")
	const docsPages = [DOCS_SITE_ADDRESS, ...docsBlockPages]
	return toLinkUrls(replyText).find(
		(linkUrl) => !findingUrls.includes(linkUrl) && !docsPages.includes(toDocsPage(linkUrl)),
	)
}

/**
 * Returns a chat reply's prose paragraphs, its blocks between blank lines without a list or a lone heading line.
 */
export function toProseParagraphs(replyText: string): string[] {
	// split the reply at blank lines, and keep the blocks that are not a list or a lone heading
	const textBlocks = replyText.split(/\n\s*\n/).map((textBlock) => textBlock.trim())
	return textBlocks.filter(
		(textBlock) =>
			textBlock && !/^\s*([-*]|\d+\.)\s/m.test(textBlock) && !/^(#{1,6}\s.+|\*\*[^*\n]+\*\*:?)$/.test(textBlock),
	)
}

/**
 * Returns the text of every model step in order, with a blank line between steps.
 */
export function toStepsText(steps: { text: string }[]): string {
	return steps
		.map((step) => step.text.trim())
		.filter(Boolean)
		.join("\n\n")
}

/**
 * Returns the url of every link that the text renders, its inline links first and then its autolinks and bare urls.
 */
export function toLinkUrls(markdownText: string): string[] {
	// the text without its fenced code blocks and inline code, where a url never renders as a link
	const renderedText = markdownText.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]+`/g, " ")

	// the inline links' urls, with any balanced parentheses kept. each link is then cut, so its text is never read again
	// as a bare url
	const inlineLinkPattern = /\[[^\]]*\]\(\s*<?((?:[^\s<>()]|\([^\s<>()]*\))+)>?[^)]*\)/g
	const inlineLinkUrls = [...renderedText.matchAll(inlineLinkPattern)].map((linkMatch) => linkMatch[1] ?? "")
	const textWithoutInlineLinks = renderedText.replace(inlineLinkPattern, " ")

	// the autolinks and bare urls that GitHub-flavored Markdown renders as links. a bare www. address renders with http
	const bareUrls = [...textWithoutInlineLinks.matchAll(/(?:https?:\/\/|www\.)[^\s<>[\]]+/g)].map((urlMatch) => {
		const trimmedBareUrl = toTrimmedBareUrl(urlMatch[0])
		return trimmedBareUrl.startsWith("www.") ? `http://${trimmedBareUrl}` : trimmedBareUrl
	})
	return [...inlineLinkUrls, ...bareUrls]
}

// a link's url without its scheme, a www. prefix, its anchor or query, and a trailing slash, the way the docs block
// labels a page
function toDocsPage(linkUrl: string): string {
	return linkUrl
		.replace(/^https?:\/\/(www\.)?/, "")
		.replace(/[#?].*$/, "")
		.replace(/\/$/, "")
}

// a bare url without the trailing punctuation and the unmatched closing parentheses that GitHub-flavored Markdown
// leaves out of a link. a balanced pair, like a Wikipedia page's, stays
function toTrimmedBareUrl(bareUrl: string): string {
	let trimmedUrl = bareUrl.replace(/[.,:;!?'"]+$/, "")

	// drop a closing parenthesis at the end while the url has more closing parentheses than opening ones
	while (trimmedUrl.endsWith(")") && countMatches(trimmedUrl, /\)/g) > countMatches(trimmedUrl, /\(/g)) {
		trimmedUrl = trimmedUrl.slice(0, -1).replace(/[.,:;!?'"]+$/, "")
	}
	return trimmedUrl
}

// how many times a pattern matches the text
function countMatches(text: string, pattern: RegExp): number {
	return text.match(pattern)?.length ?? 0
}
