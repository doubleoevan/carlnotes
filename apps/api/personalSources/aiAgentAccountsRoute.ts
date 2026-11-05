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
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"

// a key is returned only by creation, with cache storage forbidden on every control response
export const aiAgentAccountsRoute = new Hono<AppEnv>()
	.use("/personal-sources/ai-agents/*", async (context, next) => {
		context.header("Cache-Control", "no-store")
		if (!currentUser(context)) {
			return context.json({ error: "unauthorized" }, 401)
		}
		await next()
	})
	.get("/personal-sources/ai-agents/connections", async (context) => {
		const aiAgents = await loadConnectedAiAgents(currentUser(context) ?? "")
		return context.json({ aiAgents })
	})
	.get("/personal-sources/ai-agents/nudge", async (context) =>
		context.json({ consentCreatedAt: await loadPersonalSourcesConnectionNudge(currentUser(context) ?? "") }),
	)
	.post(
		"/personal-sources/ai-agents/nudge",
		zValidator("json", dismissPersonalSourcesNudgePayload),
		async (context) => {
			await dismissPersonalSourcesConnectionNudge({
				userId: currentUser(context) ?? "",
				consentCreatedAt: context.req.valid("json").consentCreatedAt,
			})
			return context.json({ ok: true as const })
		},
	)
	.delete("/personal-sources/ai-agents/connections/:aiAgentId", async (context) => {
		await revokeConnectedAiAgent({ userId: currentUser(context) ?? "", aiAgentId: context.req.param("aiAgentId") })
		return context.json({ ok: true as const })
	})
	.get("/personal-sources/ai-agents/keys", async (context) => {
		const userId = currentUser(context) ?? ""
		const keys = await listAiAgentApiKeys(userId)
		return context.json({ keys, canCreate: await isAllowed(userId, "personalSources:apiKey") })
	})
	.post("/personal-sources/ai-agents/keys", zValidator("json", createAiAgentApiKeyPayload), async (context) => {
		const result = await createAiAgentApiKey({
			userId: currentUser(context) ?? "",
			label: context.req.valid("json").label,
		})
		if (result === "forbidden") {
			return context.json({ error: "API keys require Premium." }, 403)
		}
		if (result === "limit") {
			return context.json({ error: "Revoke an API key before creating another. The limit is ten active keys." }, 409)
		}
		return context.json(result, 201)
	})
	.delete("/personal-sources/ai-agents/keys/:keyId", async (context) => {
		await revokeAiAgentApiKey({ userId: currentUser(context) ?? "", keyId: context.req.param("keyId") })
		return context.json({ ok: true as const })
	})
