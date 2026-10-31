// the Terms version every account accepts, and the rejection a stale account's user-content write gets
import { z } from "zod"

// the published Terms' version date. a new date asks every account to accept again
export const TERMS_VERSION = "2026-10-31"

// the rejection a write that other users read gets while the account's accepted version is older than the published
// one
export const TERMS_OUTDATED_REJECTION = "termsOutdated"

// what Carl says when a write waits on the Terms
export const TERMS_OUTDATED_LINE = "Carl needs you to accept the current Terms before that posts."

// the body of that rejection
export const termsOutdatedResponse = z.object({
	rejection: z.literal(TERMS_OUTDATED_REJECTION),
	termsVersion: z.string(),
})

export type TermsOutdatedResponse = z.infer<typeof termsOutdatedResponse>

// what accepting the Terms returns: the version the account now holds
export const termsAcceptanceResponse = z.object({ termsVersion: z.string(), termsAcceptedAt: z.string() })

export type TermsAcceptanceResponse = z.infer<typeof termsAcceptanceResponse>

/**
 * Returns true if an account's accepted version is the published one. An undefined version comes from an api that has
 * no version to compare, and counts as current.
 */
export function isTermsVersionCurrent(termsAcceptedVersion: string | null | undefined): boolean {
	return termsAcceptedVersion === undefined || termsAcceptedVersion === TERMS_VERSION
}

/**
 * Returns true if a response body is the terms-outdated rejection.
 */
export function isTermsOutdatedResponse(body: unknown): body is TermsOutdatedResponse {
	return termsOutdatedResponse.safeParse(body).success
}
