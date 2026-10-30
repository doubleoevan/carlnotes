import { parser, RuleType } from "markdown-to-jsx/markdown"
import { isSafeHref, NEW_TOPIC_CHAT_HREF, toNewTopicChatLinkedMarkdown } from "./safeChatMarkdown"

type ChatNode = ReturnType<typeof parser>[number]
export type ChatMarkdownSegment =
	| { kind: "markdown"; markdown: string }
	| { kind: "table"; rows: { label: string; value: string }[][] }

/**
 * Serializes safe chat Markdown and converts tables into labeled records. The new-topic invitation links to the
 * new-topic chat, as on web.
 */
export function toNativeChatMarkdown(markdown: string, isStreaming = false): ChatMarkdownSegment[] {
	// parse links once, including references, while retaining HTML as literal text
	const nodes = parser(toNewTopicChatLinkedMarkdown(markdown), {
		disableParsingRawHTML: true,
		forceBlock: true,
		sanitizer: (url) => url,
	})
	const segments: ChatMarkdownSegment[] = []
	const firstFootnoteNode = nodes.find((node) => node.type === RuleType.footnote)
	for (const [index, node] of nodes.entries()) {
		if (node.type === RuleType.table) {
			// a trailing row becomes a record only after its closing delimiter or newline arrives
			const hasIncompleteTail =
				isStreaming && index === nodes.length - 1 && !isCompleteTableTail(markdown, node.header.length)
			const rows = hasIncompleteTail ? node.cells.slice(0, -1) : node.cells
			segments.push({
				kind: "table",
				rows: rows.map((row) =>
					node.header.map((header, column) => ({
						label: serializeNodes(header).trim(),
						value: serializeNodes(row[column] ?? []).trim(),
					})),
				),
			})
			continue
		}
		// emit the shared footnote collection only once
		if (node.type === RuleType.footnote && node !== firstFootnoteNode) {
			continue
		}
		// serialize the node, or every footnote at the first one
		const serializedMarkdown = node.type === RuleType.footnote ? serializeFootnotes(nodes) : serializeNode(node)
		// extend the previous markdown segment, or start one
		const previousSegment = segments.at(-1)
		if (previousSegment?.kind === "markdown") {
			previousSegment.markdown += serializedMarkdown
		} else {
			segments.push({ kind: "markdown", markdown: serializedMarkdown })
		}
	}

	// the segments in their order
	return segments
}

// wait for a complete final table row
function isCompleteTableTail(markdown: string, columnCount: number): boolean {
	if (markdown.endsWith("\n")) {
		return true
	}
	// count the last row's unescaped pipes, and whether the last one closes the row
	const row = markdown.split("\n").at(-1)?.trim() ?? ""
	let isEscaped = false
	let delimiterCount = 0
	let hasClosingDelimiter = false
	// walk the row, skipping escaped pipes
	for (const character of row) {
		hasClosingDelimiter = character === "|" && !isEscaped
		if (character === "|" && !isEscaped) {
			delimiterCount += 1
		}
		isEscaped = character === "\\" && !isEscaped
	}
	// the row is complete once it closes and holds every column
	return hasClosingDelimiter && delimiterCount - (row.startsWith("|") ? 1 : 0) >= columnCount
}

// escape text before the native Markdown parser reads it
function escapeText(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/[\\`*_{}[\]()<>!#|~+$-]/g, "\\$&")
}

// encode link destinations for Markdown syntax
type SerializeLinkOptions = { label: string; target: string }
function serializeLink({ label, target }: SerializeLinkOptions): string {
	// the new-topic chat's exact href is the one link that is not a web destination
	if (target === NEW_TOPIC_CHAT_HREF) {
		return `[${label}](${NEW_TOPIC_CHAT_HREF})`
	}
	// any other link must be a safe web link, with its parentheses and spaces encoded
	if (!isSafeHref(target)) {
		return label
	}
	const destination = target
		.replace(/[()]/g, (character) => (character === "(" ? "%28" : "%29"))
		.replace(/[<>\\\s]/gu, encodeURIComponent)
	return `[${label}](${destination})`
}

// choose a code fence longer than the content's backtick runs
type SerializeCodeOptions = { text: string; isBlock: boolean }
function serializeCode({ text, isBlock }: SerializeCodeOptions): string {
	const delimiter = "`".repeat(
		Math.max(isBlock ? 3 : 1, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length + 1)),
	)
	return isBlock ? `${delimiter}\n${text}\n${delimiter}\n\n` : `${delimiter} ${text} ${delimiter}`
}

// serialize a run of nodes
function serializeNodes(nodes: ChatNode[]): string {
	return nodes.map(serializeNode).join("")
}

// serialize supported Markdown blocks
function serializeNode(node: ChatNode): string {
	switch (node.type) {
		// plain text
		case RuleType.text:
			return escapeText(node.text)
		case RuleType.frontmatter:
			return `${escapeText(node.text)}\n\n`
		case RuleType.footnoteReference:
			return escapeText(`[^${node.text}]`)
		// code
		case RuleType.codeInline:
			return serializeCode({ text: node.text, isBlock: false })
		case RuleType.codeBlock:
			return serializeCode({ text: node.text, isBlock: true })
		// links and images, through the safe link rule
		case RuleType.link:
			return serializeLink({ label: serializeNodes(node.children), target: node.target ?? "" })
		case RuleType.image:
			return serializeLink({ label: escapeText(node.alt || "image"), target: node.target ?? "" })
		// paragraphs, headings, and formatting
		case RuleType.paragraph:
			return `${serializeNodes(node.children)}\n\n`
		case RuleType.heading:
			return `${"#".repeat(node.level)} ${serializeNodes(node.children)}\n\n`
		case RuleType.textFormatted:
			return serializeFormatted(node)
		// breaks and task boxes
		case RuleType.breakLine:
			return "  \n"
		case RuleType.breakThematic:
			return "\n---\n\n"
		case RuleType.gfmTask:
			return node.completed ? "[x]" : "[ ]"
		// quotes
		case RuleType.blockQuote:
			return `${serializeNodes(node.children)
				.trim()
				.split("\n")
				.map((line) => `> ${line}`)
				.join("\n")}\n\n`
		// lists, and tables as a card per row
		case RuleType.orderedList:
		case RuleType.unorderedList:
			return serializeList(node)
		case RuleType.table:
			return node.cells
				.map((row) =>
					node.header
						.map((header, index) => `**${serializeNodes(header)}**: ${serializeNodes(row[index] ?? [])}\n\n`)
						.join(""),
				)
				.join("\n")
		default:
			return "text" in node && typeof node.text === "string" ? escapeText(node.text) : ""
	}
}

// retain each ordered list's starting number and indent continuation lines
function serializeList(
	node: Extract<ChatNode, { type: typeof RuleType.orderedList | typeof RuleType.unorderedList }>,
): string {
	const listLines = node.items.map((listNodes, index) => {
		const marker = node.type === RuleType.orderedList ? `${(node.start ?? 1) + index}.` : "-"
		const continuationIndent = " ".repeat(marker.length + 1)
		const listMarkdown = listNodes.map(serializeListChild).join("").trim()
		return `${marker} ${listMarkdown.replaceAll("\n", `\n${continuationIndent}`)}`
	})
	// join the items, one per line
	return `${listLines.join("\n")}\n\n`
}

// separate nested blocks from the parent item's inline text
function serializeListChild(node: ChatNode): string {
	const childMarkdown = serializeNode(node)
	switch (node.type) {
		// a nested block starts on its own line
		case RuleType.orderedList:
		case RuleType.unorderedList:
		case RuleType.blockQuote:
		case RuleType.codeBlock:
		case RuleType.heading:
		case RuleType.breakThematic:
		case RuleType.table:
			return `\n${childMarkdown}`
		// any other child stays inline
		default:
			return childMarkdown
	}
}

// keep unsupported footnotes readable without exposing their generated anchor links
function serializeFootnotes(nodes: ChatNode[]): string {
	// collect the footnote references from the reference collections
	const footnoteLines: string[] = []
	for (const node of nodes) {
		if (node.type !== RuleType.refCollection) {
			continue
		}
		// each footnote's line, by its id and target
		for (const [referenceId, reference] of Object.entries(node.refs)) {
			if (referenceId.startsWith("^")) {
				footnoteLines.push(escapeText(`[${referenceId}]: ${reference.target}`))
			}
		}
	}
	return footnoteLines.length > 0 ? `${footnoteLines.join("\n\n")}\n\n` : ""
}

// wrap formatted text in its markdown delimiter
function serializeFormatted(node: Extract<ChatNode, { type: typeof RuleType.textFormatted }>): string {
	const delimiter = node.tag === "strong" ? "**" : node.tag === "em" ? "*" : node.tag === "del" ? "~~" : ""
	return `${delimiter}${serializeNodes(node.children)}${delimiter}`
}
