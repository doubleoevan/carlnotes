// whether a password has turned up in a known breach

// haveibeenpwned's range endpoint, which returns every hash suffix sharing a prefix
const BREACH_RANGE_URL = "https://api.pwnedpasswords.com/range"

// how long to wait on the range lookup. a slow third party must not hold up a signup
const BREACH_LOOKUP_TIMEOUT_MS = 2_000

/**
 * Whether a password appears in a known breached password corpus. Only the first five characters of the hash are sent,
 * so the service never sees enough to identify it. A lookup failure returns false instead of blocking signup.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
	try {
		// sha-1 because that is the corpus's own digest, not because it is protecting anything here
		const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password))
		const hash = Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("")
			.toUpperCase()

		// the prefix goes out, the suffix stays here and is matched against what comes back
		const [prefix, suffix] = [hash.slice(0, 5), hash.slice(5)]
		const response = await fetch(`${BREACH_RANGE_URL}/${prefix}`, {
			signal: AbortSignal.timeout(BREACH_LOOKUP_TIMEOUT_MS),
		})
		if (!response.ok) {
			return false
		}
		return (await response.text()).includes(suffix)
	} catch (error) {
		// log a failure to reach the service but allow the password to be used.
		console.error("breached-password lookup failed, allowing the password", error)
		return false
	}
}
