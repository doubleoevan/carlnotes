// the signup call to action: the cookie that names the button that converted, and its tag's shape

// which signup button converted for posthog, kept in a cookie across the oauth round-trip
export const SIGNUP_CTA_COOKIE_NAME = "signup_cta"

// the allowed shape of a cta tag, a short slug
const CTA_TAG_PATTERN = /^[a-z0-9-]{1,40}$/

/**
 * The cta value when it is a well-formed tag, otherwise null.
 */

export function toCtaTag(value: string | null | undefined): string | null {
	return value && CTA_TAG_PATTERN.test(value) ? value : null
}
