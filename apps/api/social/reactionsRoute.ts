// the reaction routes: a social target's summary, and the save of the user's own reaction
import { reactionSummaryQuery, saveReactionPayload } from "@carlnotes/contracts/social"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { socialReadRateLimiter, toolCallerRateLimiter } from "../rateLimit"
import { toTermsOutdatedResponse } from "../termsAcceptance"
import { loadReactionSummary } from "./reactionRows"
import { saveReaction } from "./reactions"
import { resolveSocialTarget } from "./socialTargets"

// the reaction routes. a social target the caller cannot open is a 404, like one that does not exist
export const reactionsRoute = new Hono<AppEnv>()
	.get("/reactions/summary", socialReadRateLimiter, zValidator("query", reactionSummaryQuery), async (context) => {
		// the summary, for anyone who may open the social target
		const userId = currentUser(context)
		const target = context.req.valid("query")
		return (await resolveSocialTarget(userId, target))
			? context.json({ summary: await loadReactionSummary(userId, target) })
			: context.json({ error: "not found" }, 404)
	})
	.put("/reactions", toolCallerRateLimiter, zValidator("json", saveReactionPayload), async (context) => {
		// a save needs an account that accepted the current Terms
		const userId = currentUser(context)
		const termsResponse = toTermsOutdatedResponse(context)
		if (termsResponse || !userId) {
			return termsResponse ?? context.json({ error: "unauthorized" }, 401)
		}

		// save it and say how the save ended
		const reactionWriteResult = await saveReaction({
			userId,
			payload: context.req.valid("json"),
			analyticsProperties: toAnalyticsProperties(context),
		})
		switch (reactionWriteResult.status) {
			case "saved":
				return context.json({ summary: reactionWriteResult.summary })
			// a missing target, and an account past its day's limit
			case "notFound":
				return context.json({ error: "not found" }, 404)
			case "limitReached":
				return context.json({ error: "rate limited" }, 429)
		}
	})
