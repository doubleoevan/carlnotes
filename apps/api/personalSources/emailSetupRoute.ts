// session-only setup shares the public address while keeping Topic names sender-only
import { loadPersonalSourcesEmailSetup } from "@carlnotes/db/personalSourcesEmailSetup"
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"

export const personalSourcesEmailSetupRoute = new Hono<AppEnv>().get(
	"/topics/:id/personal-sources/email",
	async (context) => {
		// the Topic name and entitlement are never cacheable
		context.header("Cache-Control", "no-store")
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const setup = await loadPersonalSourcesEmailSetup({ userId, topicId: context.req.param("id") })
		return setup ? context.json(setup) : context.json({ error: "not found" }, 404)
	},
)
