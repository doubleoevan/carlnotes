// management endpoints demand a session even when a request carries a send key
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as keys from "@carlnotes/db/aiAgentApiKeys"
import * as connections from "@carlnotes/db/aiAgentConnections"
import * as setup from "@carlnotes/db/personalSourcesAiAgentSetup"
import * as analytics from "@carlnotes/server/analytics"
import { Hono } from "hono"
import type { SessionUser } from "../auth"
import type { AppEnv } from "../currentUser"
import { aiAgentAccountsRoute } from "./aiAgentAccountsRoute"

// use the route's real session gate with no auth-provider or database setup
afterEach(() => mock.restore())
function accountApp(userId: string | null): Hono<AppEnv> {
	return new Hono<AppEnv>()
		.use("*", async (context, next) => {
			context.set("user", userId ? ({ id: userId } as SessionUser) : null)
			await next()
		})
		.route("/", aiAgentAccountsRoute)
}

test("bearer credentials cannot list or manage account connections and keys", async () => {
	const list = spyOn(keys, "listAiAgentApiKeys")
	const load = spyOn(connections, "loadConnectedAiAgents")
	for (const path of ["/personal-sources/ai-agents/connections", "/personal-sources/ai-agents/keys"]) {
		const response = await accountApp(null).request(path, {
			headers: { authorization: `Bearer cnk_v1_${"a".repeat(32)}_${"b".repeat(43)}` },
		})
		expect(response.status).toBe(401)
		expect(response.headers.get("cache-control")).toBe("no-store")
	}
	expect(list).not.toHaveBeenCalled()
	expect(load).not.toHaveBeenCalled()
})

test("creation is the sole response carrying the one-time secret and cannot be cached", async () => {
	const key = {
		id: "key",
		label: "Agent",
		lastFour: "abcd",
		createdAt: "2026-11-02T00:00:00.000Z",
		revokedAt: null,
		lastUsedAt: null,
	}
	const createAiAgentApiKeySpy = spyOn(keys, "createAiAgentApiKey").mockResolvedValue({
		key,
		secret: "one-time-secret",
	})
	const response = await accountApp("owner").request("/personal-sources/ai-agents/keys", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ label: "Agent" }),
	})
	expect(response.status).toBe(201)
	expect(response.headers.get("cache-control")).toBe("no-store")
	expect(await response.json()).toEqual({ key, secret: "one-time-secret" })
	expect(createAiAgentApiKeySpy).toHaveBeenCalledWith({ userId: "owner", label: "Agent" })
})

test("disconnect uses the session owner and encoded domain group without client-supplied ownership", async () => {
	const revoke = spyOn(connections, "revokeConnectedAiAgent").mockResolvedValue()
	const response = await accountApp("owner").request("/personal-sources/ai-agents/connections/domain%3Aclaude.ai", {
		method: "DELETE",
	})
	expect(response.status).toBe(200)
	expect(revoke).toHaveBeenCalledWith({ userId: "owner", aiAgentId: "domain:claude.ai" })
})

test("each account control reports one event, and a rejected key reports nothing", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent")
	const app = accountApp("owner")
	const toRequest = (method: string, body?: unknown): RequestInit => ({
		method,
		headers: { "content-type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	})

	// a key that the plan rejects, then a created key and its revocation
	const createAiAgentApiKeySpy = spyOn(keys, "createAiAgentApiKey").mockResolvedValue("forbidden")
	await app.request("/personal-sources/ai-agents/keys", toRequest("POST", { label: "Agent" }))
	expect(trackEventSpy).not.toHaveBeenCalled()
	createAiAgentApiKeySpy.mockResolvedValue({ key: {} as never, secret: "one-time-secret" })
	await app.request("/personal-sources/ai-agents/keys", toRequest("POST", { label: "Agent" }))
	spyOn(keys, "revokeAiAgentApiKey").mockResolvedValue()
	await app.request("/personal-sources/ai-agents/keys/key", toRequest("DELETE"))

	// a disconnected app, and a dismissed nudge
	spyOn(connections, "revokeConnectedAiAgent").mockResolvedValue()
	await app.request("/personal-sources/ai-agents/connections/agent", toRequest("DELETE"))
	spyOn(setup, "dismissPersonalSourcesConnectionNudge").mockResolvedValue()
	const consentCreatedAt = "2026-11-02T00:00:00.000Z"
	await app.request("/personal-sources/ai-agents/nudge", toRequest("POST", { consentCreatedAt }))

	// every event names the user and the entry point, and no event holds the key's label or secret
	expect(trackEventSpy.mock.calls.map(([event, userId]) => [event, userId])).toEqual([
		["ai_agent_api_key_created", "owner"],
		["ai_agent_api_key_revoked", "owner"],
		["ai_agent_disconnected", "owner"],
		["personal_sources_nudge_dismissed", "owner"],
	])
	expect(trackEventSpy.mock.calls[0]?.[2]).toMatchObject({ entryPoint: "web", plan: "free" })
	expect(JSON.stringify(trackEventSpy.mock.calls)).not.toContain("one-time-secret")
	expect(JSON.stringify(trackEventSpy.mock.calls)).not.toContain("Agent")
})
