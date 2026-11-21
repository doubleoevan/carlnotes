// the page read test fixtures: a page head that a test's page read holds in place of one built from the database
import type { PageHead } from "@carlnotes/contracts/pageHead"

/**
 * Returns a page head with the title, for a page read that a test builds over stubbed rows.
 */
export function toTestPageHead(title: string): PageHead {
	return {
		title,
		cardTitle: title,
		description: `${title} on CarlNotes`,
		canonicalUrl: null,
		cardUrl: "http://localhost/",
		imageUrl: "http://localhost/og.png",
		feedUrl: null,
		isIndexed: false,
		jsonLd: null,
	}
}
