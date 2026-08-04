// the LiteLLM proxy admin api: minting per-user virtual keys, retiring them, and reading their spend.
// callers pass a budget in cents and this module converts to the proxy's dollars

// a 30-day budget resets on the 1st of every month at midnight utc, which is the calendar month the app
// reports spend against everywhere else. it is not a rolling window counted from the key's own creation
const LITELLM_BUDGET_DURATION = "30d"

/**
 * Mint a budgeted virtual key for a user. budgetCents is their effective monthly ceiling.
 */
export async function provisionLiteLLMKey(email: string, budgetCents: number): Promise<string> {
	// ask the proxy to mint a budgeted key aliased to the user's email. the alias carries the mint time too,
	// since replacing a key mints the new one while the old still exists and an alias may only be used once
	const { baseURL, masterKey } = litellmConfig()
	const response = await fetch(`${baseURL}/key/generate`, {
		method: "POST",
		headers: authHeaders(masterKey),
		body: JSON.stringify({
			user_id: email,
			key_alias: `user:${email}:${Date.now()}`,
			max_budget: budgetCents / 100,
			budget_duration: LITELLM_BUDGET_DURATION,
		}),
	})
	// surface a specific failure instead of an opaque parse error downstream
	if (!response.ok) {
		throw new Error(`litellm key/generate failed: ${response.status} ${await response.text()}`)
	}
	const { key } = (await response.json()) as { key: string }
	return key
}

/**
 * Retire a virtual key, so its remaining allowance can never be spent after it is replaced.
 */
export async function deleteLiteLLMKey(key: string): Promise<void> {
	// point the proxy's /key/delete at the retired key
	const { baseURL, masterKey } = litellmConfig()
	const response = await fetch(`${baseURL}/key/delete`, {
		method: "POST",
		headers: authHeaders(masterKey),
		body: JSON.stringify({ keys: [key] }),
	})
	// surface a specific failure so a key left live is visible, not silent
	if (!response.ok) {
		throw new Error(`litellm key/delete failed: ${response.status} ${await response.text()}`)
	}
}

/**
 * Read a key's spend this budget period, in dollars. Returns null when the proxy is unreachable or the key is unknown,
 * so the admin page still renders the rest of a user's row.
 */
export async function readLiteLLMKeySpend(key: string): Promise<number | null> {
	try {
		// /key/info reports the authoritative spend LiteLLM recorded for this key
		const { baseURL, masterKey } = litellmConfig()
		const response = await fetch(`${baseURL}/key/info?key=${encodeURIComponent(key)}`, {
			headers: authHeaders(masterKey),
		})
		if (!response.ok) {
			return null
		}
		const { info } = (await response.json()) as { info?: { spend?: number } }
		return info?.spend ?? null
	} catch {
		// a network failure is not fatal to the admin view. treat spend as unknown
		return null
	}
}

// the proxy base url and master key, required for every admin call
function litellmConfig(): { baseURL: string; masterKey: string } {
	const baseURL = Bun.env.LITELLM_BASE_URL
	const masterKey = Bun.env.LITELLM_MASTER_KEY
	if (!baseURL || !masterKey) {
		throw new Error("LITELLM_BASE_URL and LITELLM_MASTER_KEY must be set to manage user keys")
	}
	return { baseURL, masterKey }
}

// the master-key auth headers for the proxy admin api
function authHeaders(masterKey: string): Record<string, string> {
	return { Authorization: `Bearer ${masterKey}`, "Content-Type": "application/json" }
}
