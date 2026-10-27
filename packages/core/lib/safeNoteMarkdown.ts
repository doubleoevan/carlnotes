import { parser, RuleType } from "markdown-to-jsx/markdown"

// both renderers consume this tree directly; destinations are never reparsed as Markdown
export type SafeNoteMarkdown = ReturnType<typeof parser>
type NoteNode = SafeNoteMarkdown[number]

/**
 * Allows only an exact stored HTTP(S) destination, without URL normalization broadening the allowlist.
 */
export function isAllowedNoteUrl(href: unknown, allowedUrls?: ReadonlySet<string>): href is string {
	return typeof href === "string" && /^https?:\/\/[^\s]+$/i.test(href) && !!allowedUrls?.has(href)
}

/**
 * Parses once, retaining rejected destinations as inert text and dropping images before either renderer runs.
 */
export function toSafeNoteMarkdown(note: string, allowedUrls?: ReadonlySet<string>): SafeNoteMarkdown {
	// retain original destinations for the rejection text; the transformation below owns URL safety
	const nodes = parser(note, { disableParsingRawHTML: true, forceBlock: true, sanitizer: (url) => url })
	return toSafeNoteNodes(nodes, allowedUrls)
}

/**
 * Filters nested blocks, lists, and table cells using the same link and image policy.
 */
export function toSafeNoteNodes(nodes: SafeNoteMarkdown, allowedUrls?: ReadonlySet<string>): SafeNoteMarkdown {
	return Array.isArray(nodes) ? nodes.flatMap((node) => toSafeNode(node, allowedUrls)) : []
}

// reference links have already resolved; removing definitions prevents a renderer from parsing them again
function toSafeNode(node: NoteNode, allowedUrls?: ReadonlySet<string>): SafeNoteMarkdown {
	if (!node || typeof node !== "object") {
		return []
	}
	if (
		node.type === RuleType.image ||
		node.type === RuleType.refCollection ||
		node.type === RuleType.ref ||
		node.type === RuleType.footnote
	) {
		return []
	}
	if (node.type === RuleType.link) {
		return toSafeLink(node, allowedUrls)
	}
	if (node.type === RuleType.footnoteReference) {
		return [{ type: RuleType.text, text: node.text }]
	}
	if (
		node.type === RuleType.htmlBlock ||
		node.type === RuleType.htmlSelfClosing ||
		node.type === RuleType.htmlComment
	) {
		return []
	}
	if (node.type === RuleType.table) {
		return [
			{
				...node,
				header: node.header.map((cell) => toSafeNoteNodes(cell, allowedUrls)),
				cells: node.cells.map((row) => row.map((cell) => toSafeNoteNodes(cell, allowedUrls))),
			},
		]
	}
	if (node.type === RuleType.orderedList || node.type === RuleType.unorderedList) {
		return [{ ...node, items: node.items.map((item) => toSafeNoteNodes(item, allowedUrls)) }]
	}
	if ("children" in node && Array.isArray(node.children)) {
		return [{ ...node, children: toSafeNoteNodes(node.children, allowedUrls) }]
	}
	return [node]
}

// a bare URL is already its own label; an ordinary label keeps its rejected destination visible
function toSafeLink(
	node: Extract<NoteNode, { type: typeof RuleType.link }>,
	allowedUrls?: ReadonlySet<string>,
): SafeNoteMarkdown {
	const children = toSafeNoteNodes(node.children, allowedUrls)
	if (!children.length) {
		return []
	}
	if (isAllowedNoteUrl(node.target, allowedUrls)) {
		return [{ ...node, children }]
	}
	const label = toVisibleText(children)
	return node.target && label !== node.target
		? [...children, { type: RuleType.text, text: ` (${node.target})` }]
		: children
}

// compare formatted labels using the text both renderers display
function toVisibleText(nodes: SafeNoteMarkdown): string {
	return nodes
		.map((node) => {
			if ("text" in node && typeof node.text === "string") {
				return node.text
			}
			return "children" in node && Array.isArray(node.children) ? toVisibleText(node.children) : ""
		})
		.join("")
}
