// the api server for the topic feed. the ui calls these routes through a fully typed client.
import { zValidator } from "@hono/zod-validator"
import { consumedPayload, ratingPayload } from "@shared/contracts"
import { Hono } from "hono"
import { z } from "zod"
import { currentUser } from "./currentUser"
import { buildTopicFeeds, recordView, setConsumed, setRating } from "./topicFeed.ts"

// the "All" vs. "Unread" topic finding toggle
const topicFeedQuery = z.object({ all: z.enum(["true", "false"]).optional() })

// the topic feed routes under /api
const route = new Hono()
	.basePath("/api")
	.get("/topic-feed", zValidator("query", topicFeedQuery), async (context) => {
		// only include consumed topic findings unless the client asks for the "All" view
		const includeConsumed = context.req.valid("query").all === "true"
		return context.json(await buildTopicFeeds(currentUser(), includeConsumed))
	})
	.post("/topic-findings/:id/rating", zValidator("json", ratingPayload), async (context) => {
		// rate this topic finding up, down, or clear the rating. only its topic's owner or a subscriber may
		const rated = await setRating(currentUser(), context.req.param("id"), context.req.valid("json").rating)
		return rated ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/consume", zValidator("json", consumedPayload), async (context) => {
		// mark this topic finding consumed or unread for the current user
		const consumed = await setConsumed(currentUser(), context.req.param("id"), context.req.valid("json").isConsumed)
		return consumed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.post("/topic-findings/:id/view", async (context) => {
		// opening a resource records a view on its topic finding and marks the finding consumed
		const viewed = await recordView(currentUser(), context.req.param("id"))
		return viewed ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})

// the ui builds its typed client from this definition
export type AppType = typeof route

// in dev this runs on port 3000 and vite forwards /api to it. in prod, one service serves both the ui and the api.
export default { port: 3000, fetch: route.fetch }
