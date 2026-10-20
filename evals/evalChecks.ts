// the grading result that every check in code returns, the no-markdown check, the chat reply checks that need no
// model, and the chat reply case line
import type { Assertion, AssertionValueFunctionContext, EvaluateResult, GradingResult } from "promptfoo"
import { toWriteCostLabel } from "./evalLabels"
import { toDisallowedLinkUrl, toMarkdownMarkup, toProseParagraphs } from "./evalReplies"

// how many paragraphs a chat reply may have, its lists and its headings aside
const MAX_REPLY_PARAGRAPHS = 3

// the material a chat reply may link to, the findings' urls and the docs pages in the docs block
export type ChatReplyMaterial = { findings: { url: string }[]; docsBlock: string }

// the check that fails a spoken answer if it has markdown
export const NO_MARKDOWN_ASSERTION: Assertion = {
	type: "javascript",
	metric: "has no markdown",
	value: gradeNoMarkdown,
}

/**
 * Returns a check's promptfoo grading result, which passes if there is no failure reason.
 */
export function toGradingResult(failureReason?: string): GradingResult {
	return { pass: !failureReason, score: failureReason ? 0 : 1, reason: failureReason ?? "passed" }
}

/**
 * Returns the chat reply checks that need no model, which pass a reply that links only to the case's material and has
 * a limited paragraph count.
 */
export function toChatReplyAssertions(
	toChatReplyMaterial: (context: AssertionValueFunctionContext) => ChatReplyMaterial,
): Assertion[] {
	return [
		{
			type: "javascript",
			metric: "links only to the findings and the docs",
			value: (replyText: string, context: AssertionValueFunctionContext) =>
				gradeLinksToMaterial(replyText, toChatReplyMaterial(context)),
		},
		{ type: "javascript", metric: `has ${MAX_REPLY_PARAGRAPHS} paragraphs or fewer`, value: gradeParagraphCount },
	]
}

/**
 * Returns a chat reply case's paragraph count and reply cost.
 */
export function toChatReplyCaseLine(replyText: string, evaluateResult: EvaluateResult): string {
	return `${toProseParagraphs(replyText).length} paragraphs, ${toWriteCostLabel(evaluateResult.cost)}`
}

// fail the check if a spoken answer has markdown: a heading, a list, a table, fenced code, or a link
function gradeNoMarkdown(replyText: string): GradingResult {
	const markdownMarkup = toMarkdownMarkup(replyText)
	return toGradingResult(markdownMarkup && `the reply has ${markdownMarkup}`)
}

// fail the check if the reply links anywhere but a finding's url, the docs root, or a docs page in the material
function gradeLinksToMaterial(replyText: string, { findings, docsBlock }: ChatReplyMaterial): GradingResult {
	// find the first link that is neither a finding's url nor a docs page
	const findingUrls = findings.map((finding) => finding.url)
	const disallowedLinkUrl = toDisallowedLinkUrl({ replyText, findingUrls, docsBlock })
	return toGradingResult(disallowedLinkUrl && `the reply links ${disallowedLinkUrl}`)
}

// fail the check if the reply has more than MAX_REPLY_PARAGRAPHS paragraphs that are not lists or headings
function gradeParagraphCount(replyText: string): GradingResult {
	const paragraphCount = toProseParagraphs(replyText).length
	return toGradingResult(
		paragraphCount > MAX_REPLY_PARAGRAPHS ? `the reply has ${paragraphCount} paragraphs` : undefined,
	)
}
