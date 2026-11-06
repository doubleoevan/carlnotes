// selected imports require the owner's session and a bounded normalized JSON body
import { TOPIC_ATTACHMENT_MAX_BYTES } from "@carlnotes/contracts/attachmentTypes"
import { personalSourcesImportPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { importPersonalSourcesConversations } from "@carlnotes/db/personalSourcesImports"
import { notifyPersonalSourcesChanged } from "@carlnotes/pipeline/personalSources/work"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { toBodyLimit, uploadSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"

// the root body limiter delegates this path to its 10 MiB selected-batch bound
export const PERSONAL_SOURCES_IMPORT_PATH = "/topics/:id/personal-sources/imports"
export const personalSourcesImportsRoute = new Hono<AppEnv>().post(
	PERSONAL_SOURCES_IMPORT_PATH,
	uploadSignedOutRejection,
	toBodyLimit(TOPIC_ATTACHMENT_MAX_BYTES),
	zValidator("json", personalSourcesImportPayload),
	async (context) => {
		context.header("Cache-Control", "no-store")
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const imported = await importPersonalSourcesConversations({
			userId,
			topicId: context.req.param("id"),
			payload: context.req.valid("json"),
		})
		if (imported.status === "accepted") {
			await notifyPersonalSourcesChanged(context.req.param("id"))
			trackEvent("personal_source_entry_received", userId, {
				...toAnalyticsProperties(context),
				origin: "import",
				topicId: context.req.param("id"),
				entryCount: imported.entryIds.length,
			})
		}
		// each status returns its own http status
		if (imported.status === "not_found") {
			return context.json(imported, 404)
		}
		if (imported.status === "conflict") {
			return context.json(imported, 409)
		}
		return context.json(imported, imported.status === "unavailable" ? 503 : 200)
	},
)
