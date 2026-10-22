// the text order check that the api and web tests share

/**
 * Returns whether every substring appears in the text, each one after the substring before it.
 */
export function hasSubstringsInOrder(text: string, substrings: string[]): boolean {
	// each search starts where the previous match ended, so a repeated substring needs a second match
	let searchOffset = 0
	for (const substring of substrings) {
		// a missing substring fails the check
		const offset = text.indexOf(substring, searchOffset)
		if (offset === -1) {
			return false
		}
		searchOffset = offset + substring.length
	}
	return true
}
