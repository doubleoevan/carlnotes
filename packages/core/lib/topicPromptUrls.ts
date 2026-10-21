// the urls written inside a topic prompt
const PROMPT_URL_PATTERN = /https?:\/\/\S*[^\s<>"'.,;:!?]/gi

// a url keeps a closing bracket it opened and gives back one the sentence around it opened
function toBalancedUrl(url: string): string {
	let balancedUrl = url
	while (/[)\]]$/.test(balancedUrl)) {
		// count only the bracket kind the url ends with, so a url ending in ] is not measured by its parens
		const isParenthesis = balancedUrl.endsWith(")")
		const openingBracket = isParenthesis ? "(" : "["
		const closingBracket = isParenthesis ? ")" : "]"
		const openingCount = balancedUrl.split(openingBracket).length - 1
		const closingCount = balancedUrl.split(closingBracket).length - 1
		if (openingCount >= closingCount) {
			break
		}

		// the url never opened this one, so it belongs to the sentence
		balancedUrl = balancedUrl.slice(0, -1)
	}
	return balancedUrl
}

// the url a Source reads, for the kinds that name one. everything else has no url to compare against
function toSourceUrl(
	source: { sourceKind: string; config?: Record<string, unknown> } | { optionKey: string; value: string },
): string {
	// a staged Source includes the raw value typed into its picker option, while a stored one includes a parsed config
	if ("value" in source) {
		return source.optionKey === "url" || source.optionKey === "rss" ? source.value : ""
	}
	return typeof source.config?.url === "string" ? source.config.url : ""
}

/**
 * The urls written in a topic prompt that are not already a Source. They are suggested instead of being added.
 */
export function toPossibleSourceUrls(
	prompt: string,
	keptSources: { sourceKind: string; config?: Record<string, unknown> }[],
	addedSources: { optionKey: string; value: string }[],
): string[] {
	const sourceUrls = new Set([...keptSources, ...addedSources].map(toSourceUrl).filter(Boolean))
	const writtenUrls = (prompt.match(PROMPT_URL_PATTERN) ?? []).map(toBalancedUrl)
	return [...new Set(writtenUrls)].filter((url) => !sourceUrls.has(url))
}
