// the status read routes after /api/status/: a film's, a Topic Post Discussion's, and a Topic's latest Scan's. a
// page's poll reads one in place of its page, and a public subject's status is shared at the edge for three seconds
import { type Context, Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { setPollCacheHeaders } from "../edgeCache"
import {
	loadTopicPostDiscussionStatusRead,
	loadTopicScanStatusRead,
	loadTopicVideoStatusRead,
	type StatusReadResult,
} from "./statusReads"

export const statusReadsRoute = new Hono<AppEnv>()
	// a podcast episode's film status
	.get("/status/episodes/:id/topic-video", async (context) =>
		toStatusReadResponse(
			context,
			await loadTopicVideoStatusRead({ userId: currentUser(context), subjectId: context.req.param("id") }),
		),
	)
	// a Topic Post's newest discussion status
	.get("/status/topic-posts/:id/discussion", async (context) =>
		toStatusReadResponse(
			context,
			await loadTopicPostDiscussionStatusRead({ userId: currentUser(context), subjectId: context.req.param("id") }),
		),
	)
	// a Topic's latest Scan with its counts, and its newest podcast episode's status
	.get("/status/topics/:id/scan", async (context) =>
		toStatusReadResponse(
			context,
			await loadTopicScanStatusRead({ userId: currentUser(context), subjectId: context.req.param("id") }),
		),
	)

// a status for a caller who may read it, or a 404 as for a subject that does not exist, shared at the edge if public
function toStatusReadResponse<StatusRead extends object>(
	context: Context<AppEnv>,
	statusReadResult: StatusReadResult<StatusRead> | null,
): Response {
	const response = statusReadResult
		? context.json(statusReadResult.statusRead)
		: context.json({ error: "not found" }, 404)
	setPollCacheHeaders(context.req.raw, response, statusReadResult?.isPublic ?? false)
	return response
}
