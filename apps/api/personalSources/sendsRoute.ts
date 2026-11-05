// a send-only bearer key cannot become a session or reach personal sources management routes
import { personalSourcesSendPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { sendToPersonalSources } from "@carlnotes/pipeline/personalSources/send"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"

// errors contain only contract outcomes and never repeat the bearer header or private body
export const personalSourcesSendsRoute = new Hono<AppEnv>()
	.use("/personal-sources/sends", async (context, next) => {
		context.header("Cache-Control", "no-store")
		await next()
	})
	.post("/personal-sources/sends", zValidator("json", personalSourcesSendPayload), async (context) => {
		const authorization = context.req.header("authorization") ?? ""
		const secret = /^Bearer (cnk_v1_[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1]
		if (!secret) {
			return context.json({ status: "disconnected" as const }, 401)
		}
		const result = await sendToPersonalSources({
			sender: { kind: "api_key", secret },
			payload: context.req.valid("json"),
		})
		switch (result.status) {
			case "accepted":
				return context.json(result, 200)
			case "quota":
				return context.json(result, 429)
			case "disconnected":
				return context.json(result, 401)
			case "not_found":
				return context.json(result, 404)
			case "conflict":
				return context.json(result, 409)
			case "unavailable":
				return context.json(result, 503)
		}
	})
