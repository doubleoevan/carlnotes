// session-only connection and one-time credential controls
import {
	createAiAgentApiKeyPayload,
	dismissPersonalSourcesNudgePayload,
} from "@carlnotes/contracts/personalSourcesAccounts"
import { createAiAgentApiKey, listAiAgentApiKeys, revokeAiAgentApiKey } from "@carlnotes/db/aiAgentApiKeys"
import { loadConnectedAiAgents, revokeConnectedAiAgent } from "@carlnotes/db/aiAgentConnections"
import { isAllowed } from "@carlnotes/db/authorization"
import {
	dismissPersonalSourcesConnectionNudge,
	loadPersonalSourcesConnectionNudge,
} from "@carlnotes/db/personalSourcesAiAgentSetup"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"

// a key is returned only by creation, with cache storage forbidden on every control response
export const aiAgentAccountsRoute = new Hono<AppEnv>()
	.use("/personal-sources/ai-agents/*", async (context, next) => {
		context.header("Cache-Control", "no-store")
		if (!currentUser(context)) {
			return context.json({ error: "unauthorized" }, 401)
		}
		await next()
	})

	// the user's AI Agents
	.get("/personal-sources/ai-agents/connections", async (context) => {
		const aiAgents = await loadConnectedAiAgents(currentUser(context) ?? "")
		return context.json({ aiAgents })
	})

	// the nudge to connect an AI Agent
	.get("/personal-sources/ai-agents/nudge", async (context) =>
		context.json({ consentCreatedAt: await loadPersonalSourcesConnectionNudge(currentUser(context) ?? "") }),
	)

	// dismiss the nudge
	.post(
		"/personal-sources/ai-agents/nudge",
		zValidator("json", dismissPersonalSourcesNudgePayload),
		async (context) => {
			const userId = currentUser(context) ?? ""
			await dismissPersonalSourcesConnectionNudge({
				userId,
				consentCreatedAt: context.req.valid("json").consentCreatedAt,
			})
			trackEvent("personal_sources_nudge_dismissed", userId, toAnalyticsProperties(context))
			return context.json({ ok: true as const })
		},
	)

	// disconnect an AI Agent
	.delete("/personal-sources/ai-agents/connections/:aiAgentId", async (context) => {
		const userId = currentUser(context) ?? ""
		await revokeConnectedAiAgent({ userId, aiAgentId: context.req.param("aiAgentId") })
		trackEvent("ai_agent_disconnected", userId, toAnalyticsProperties(context))
		return context.json({ ok: true as const })
	})

	// the user's API keys
	.get("/personal-sources/ai-agents/keys", async (context) => {
		const userId = currentUser(context) ?? ""
		const keys = await listAiAgentApiKeys(userId)
		return context.json({ keys, canCreate: await isAllowed(userId, "personalSources:apiKey") })
	})

	// create an API key
	.post("/personal-sources/ai-agents/keys", zValidator("json", createAiAgentApiKeyPayload), async (context) => {
		const userId = currentUser(context) ?? ""
		const createAiAgentApiKeyResult = await createAiAgentApiKey({ userId, label: context.req.valid("json").label })

		// the plan and the key limit can reject the new key
		if (createAiAgentApiKeyResult === "forbidden") {
			return context.json({ error: "API keys require Premium." }, 403)
		}
		if (createAiAgentApiKeyResult === "limit") {
			return context.json({ error: "Revoke an API key before creating another. The limit is ten keys." }, 409)
		}

		// only a created key reports an event
		trackEvent("ai_agent_api_key_created", userId, toAnalyticsProperties(context))
		return context.json(createAiAgentApiKeyResult, 201)
	})

	// revoke an API key
	.delete("/personal-sources/ai-agents/keys/:keyId", async (context) => {
		const userId = currentUser(context) ?? ""
		await revokeAiAgentApiKey({ userId, keyId: context.req.param("keyId") })
		trackEvent("ai_agent_api_key_revoked", userId, toAnalyticsProperties(context))
		return context.json({ ok: true as const })
	})
