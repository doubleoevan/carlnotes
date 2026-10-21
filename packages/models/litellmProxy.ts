// the LiteLLM proxy's key api: create a budgeted key, delete one, and read one's spend and budget

// how long a proxy admin call may run before it counts as failed
const LITELLM_ADMIN_TIMEOUT_MS = 5000

// a key's recorded spend and its maximum budget in dollars. a key with no maximum budget has a null budget
export type LiteLLMKeyBudget = { spendDollars: number; maxBudgetDollars: number | null }

/**
 * Creates a virtual key for a user at the user's monthly budget. The proxy never resets the key's spend on its own.
 * The spend starts again at zero only when the monthly budget reset or a plan or budget change replaces the key.
 */
export async function provisionLiteLLMKey(email: string, budgetCents: number): Promise<string> {
	// ask the proxy for a budgeted key aliased to the user's email and the creation time
	const { baseURL, masterKey } = litellmConfig()
	const response = await fetch(`${baseURL}/key/generate`, {
		method: "POST",
		headers: authHeaders(masterKey),
		// the key is the user's, aliased to their email and the creation time, at their budget in dollars
		body: JSON.stringify({
			user_id: email,
			key_alias: `user:${email}:${Date.now()}`,
			max_budget: budgetCents / 100,
		}),
		signal: AbortSignal.timeout(LITELLM_ADMIN_TIMEOUT_MS),
	})
	// log the proxy's response body and throw an error that names only the status
	if (!response.ok) {
		console.error(`litellm key/generate failed: ${response.status}`, await response.text())
		throw new Error(`litellm key/generate failed: ${response.status}`)
	}
	const { key } = (await response.json()) as { key: string }
	return key
}

/**
 * Deletes a virtual key from the proxy, so nothing can spend what is left of its budget.
 */
export async function deleteLiteLLMKey(key: string): Promise<void> {
	// ask the proxy to delete the key
	const { baseURL, masterKey } = litellmConfig()
	const response = await fetch(`${baseURL}/key/delete`, {
		method: "POST",
		headers: authHeaders(masterKey),
		body: JSON.stringify({ keys: [key] }),
		signal: AbortSignal.timeout(LITELLM_ADMIN_TIMEOUT_MS),
	})

	// a key that the proxy does not know is already deleted
	if (response.status === 404) {
		return
	}

	// log the proxy's response body and throw an error that names only the status
	if (!response.ok) {
		console.error(`litellm key/delete failed: ${response.status}`, await response.text())
		throw new Error(`litellm key/delete failed: ${response.status}`)
	}
}

/**
 * Reads a key's recorded spend and maximum budget.
 * Returns null if the proxy is unreachable, times out, or does not know the key.
 */
export async function readLiteLLMKeyBudget(key: string): Promise<LiteLLMKeyBudget | null> {
	try {
		// ask the proxy for the key's recorded spend and maximum budget
		const { baseURL, masterKey } = litellmConfig()
		const response = await fetch(`${baseURL}/key/info?key=${encodeURIComponent(key)}`, {
			headers: authHeaders(masterKey),
			signal: AbortSignal.timeout(LITELLM_ADMIN_TIMEOUT_MS),
		})
		// a failed response, such as for a key that the proxy does not know, reads as an unknown budget
		if (!response.ok) {
			return null
		}

		// return the spend and the maximum budget. a response with no spend reads as an unknown budget
		const { info } = (await response.json()) as { info?: { spend?: number; max_budget?: number | null } }
		if (typeof info?.spend !== "number") {
			return null
		}
		return { spendDollars: info.spend, maxBudgetDollars: info.max_budget ?? null }
	} catch {
		// a network failure or a timeout reads as an unknown budget
		return null
	}
}

/**
 * Reads a key's recorded spend in dollars, or null if the proxy is unreachable, times out, or does not know the key.
 */
export async function readLiteLLMKeySpend(key: string): Promise<number | null> {
	// read the key's budget and return its spend
	const litellmKeyBudget = await readLiteLLMKeyBudget(key)
	return litellmKeyBudget?.spendDollars ?? null
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
