// the markup checks that the component render tests share

/**
 * Returns the class attribute of every element with the tag name in the markup, in order.
 */
export function toElementClassNames(html: string, tagName: string): string[] {
	return [...html.matchAll(new RegExp(`<${tagName}\\s(?:[^>]*\\s)?class="([^"]*)"`, "g"))].map(
		([, className = ""]) => className,
	)
}
