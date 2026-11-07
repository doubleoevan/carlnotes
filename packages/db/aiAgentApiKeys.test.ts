// API credentials are bounded, one-time, digest-only, and rechecked against current entitlements
import { afterEach, expect, test } from "bun:test"
import {
	authenticateAiAgentApiKey,
	createAiAgentApiKey,
	listAiAgentApiKeys,
	revokeAiAgentApiKey,
} from "./aiAgentApiKeys"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { db } from "./index"
import { runWithRequestMemo } from "./requestMemo"
import { aiAgentApiKeys } from "./schema/personalSources"

// restore the real pool after each deterministic fixture
afterEach(restoreConnectionPool)
const createdAt = "2026-11-02T12:00:00.000Z"
const keyId = "a".repeat(32)
const secret = `cnk_v1_${keyId}_${"b".repeat(43)}`
const secretDigest = new Bun.CryptoHasher("sha256").update(secret).digest("hex")

test("creation returns a bearer once and persists only its digest and four-character suffix", async () => {
	// no key yet, and a Premium account
	const queries = stubConnectionPool(({ text, values }) => {
		if (text.includes("select count(*)")) {
			return [[0]]
		}

		// the inserted key, then the account
		if (text.startsWith('insert into "agent_api_keys"')) {
			return [[values[0], "Coding agent", values[4], createdAt, null, null]]
		}
		return text.includes('from "users"') ? [["user", "premium", null]] : []
	})

	// the bearer is returned once
	const result = await createAiAgentApiKey({ userId: "owner", label: "Coding agent" })
	if (typeof result === "string") {
		throw new Error(result)
	}
	expect(result.secret).toMatch(/^cnk_v1_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/)

	// the insert stores the digest and the suffix, never the bearer
	const insertion = queries.find((query) => query.text.startsWith('insert into "agent_api_keys"'))
	expect(JSON.stringify(insertion)).not.toContain(result.secret)
	expect(insertion?.values).toContain(new Bun.CryptoHasher("sha256").update(result.secret).digest("hex"))
	expect(insertion?.values).toContain(result.secret.slice(-4))
	expect(result.key).not.toHaveProperty("secretDigest")
	expect(result.key).not.toHaveProperty("secret")
})

test.each(["free", "plus", "premium"])("creation enforces Premium and ten active keys on %s", async (plan) => {
	const queries = stubConnectionPool(({ text }) =>
		text.includes("select count(*)") ? [[10]] : text.includes('from "users"') ? [["user", plan, null]] : [],
	)
	expect(await createAiAgentApiKey({ userId: "owner", label: "Agent" })).toBe(
		plan === "premium" ? "limit" : "forbidden",
	)
	expect(queries.some((query) => query.text.startsWith("insert"))).toBe(false)
	expect(queries[0]?.text).toContain("for update")
})

test("a credential rechecks a downgrade inside its transaction despite earlier memoized Premium access", async () => {
	// the plan and the key's row change between the reads
	let plan = "premium"
	let isDeleted = false
	const queries = stubConnectionPool(({ text }) => {
		if (text.includes('from "agent_api_keys"')) {
			return isDeleted
				? []
				: [
						toTableRow(aiAgentApiKeys, {
							id: keyId,
							userId: "owner",
							secretDigest,
							label: "Coding agent",
							lastFour: "bbbb",
							createdAt,
						}),
					]
		}
		return text.includes('from "users"') ? [["user", plan, null]] : []
	})
	await runWithRequestMemo(async () => {
		expect(await authenticateAiAgentApiKey(secret)).toEqual({ userId: "owner", keyId, label: "Coding agent" })
		expect(await authenticateAiAgentApiKey(`${secret.slice(0, -1)}c`)).toBeNull()
		plan = "free"
		// use a separate handle to model the transaction's uncached authority read
		const transaction = new Proxy(db, {})
		expect(await authenticateAiAgentApiKey(secret, transaction)).toBeNull()
	})
	plan = "premium"
	isDeleted = true
	expect(await authenticateAiAgentApiKey(secret)).toBeNull()
	expect(JSON.stringify(queries)).not.toContain(secret)
})

test("malformed credentials avoid database work and lists never select a digest", async () => {
	// each malformed bearer stops before a query
	const queries = stubConnectionPool()
	for (const malformed of ["", "cnk_v1_bad", `${secret}extra`, ` ${secret}`, secret.toUpperCase()]) {
		expect(await authenticateAiAgentApiKey(malformed)).toBeNull()
	}
	expect(queries).toHaveLength(0)

	// the list reads no digest
	expect(await listAiAgentApiKeys("owner")).toEqual([])
	expect(queries[0]?.text).not.toContain("secret_digest")
})

test("revocation remains available after downgrade and is scoped to the owner", async () => {
	const queries = stubConnectionPool()
	await revokeAiAgentApiKey({ userId: "owner", keyId })
	expect(queries[0]?.text).toContain("for update")

	// the delete names the owner and the key
	const deleteQuery = queries[1]
	expect(deleteQuery?.text).toStartWith('delete from "agent_api_keys"')
	expect(deleteQuery?.text).toContain('"user_id" =')
	expect(deleteQuery?.values).toContain("owner")
	expect(deleteQuery?.values).toContain(keyId)
})
