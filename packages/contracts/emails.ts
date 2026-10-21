// the domains that gmail treats as one identity. an old googlemail.com address is the same mailbox as its gmail.com twin
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"])

/**
 * Converts a Gmail address to its canonical form for duplicate detection.
 */
export function toCanonicalEmail(email: string): string {
	const [localPart, domain] = email.toLowerCase().split("@")
	if (!localPart || !domain || !GMAIL_DOMAINS.has(domain)) {
		return email.toLowerCase()
	}
	const canonicalLocalPart = localPart.replace(/\+.*/, "").replaceAll(".", "")
	return `${canonicalLocalPart}@gmail.com`
}
