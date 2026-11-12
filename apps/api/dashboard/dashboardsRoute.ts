// the Dashboard pages' reads of the map settings, a snapshot for one chart selection at the user's access, the page
// head, and the public share image
import { dashboardParam, dashboardQuery, toDefaultDashboardSelection } from "@carlnotes/contracts/dashboards"
import { attachmentStream } from "@carlnotes/db/store"
import { toDashboardCacheTag } from "@carlnotes/server/edgePurge"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { setDashboardCacheHeaders, toVersionedImageHeaders } from "../edgeCache"
import { dashboardReadRateLimiter } from "../rateLimit"
import { loadDashboardPageHead } from "./dashboardPageHead"
import { loadDashboard, loadDashboardAccess, loadDashboardShareImageKey } from "./dashboards"

// a share image's file name: its public summary's hash and the png extension
const SHARE_IMAGE_FILE_PATTERN = /^([0-9a-f]{64})\.png$/

export const dashboardsRoute = new Hono<AppEnv>()
	// the web map's Google Maps browser key and Map ID, both public
	.get("/dashboards/map-settings", (context) =>
		context.json({
			apiKey: Bun.env.GOOGLE_MAPS_WEB_API_KEY?.trim() || null,
			mapId: Bun.env.GOOGLE_MAPS_WEB_MAP_ID?.trim() || null,
		}),
	)
	// one selection's snapshot, an item kind for Topic and Team Dashboard or a format for Podcast Dashboard, else the
	// page's default selection
	.get(
		"/dashboards/:dashboardKind/:subjectId",
		dashboardReadRateLimiter,
		zValidator("param", dashboardParam),
		zValidator("query", dashboardQuery),
		async (context) => {
			// the Dashboard the path names, and the format a podcast page names or the item kind another page names, else
			// the page's default selection
			const { dashboardKind, subjectId } = context.req.valid("param")
			const { itemKind, format } = context.req.valid("query")
			const selection =
				(dashboardKind === "podcastDashboard" ? format : itemKind) ?? toDefaultDashboardSelection(dashboardKind)

			// the user's access, then the snapshot at it
			const dashboardAccess = await loadDashboardAccess({ userId: currentUser(context), dashboardKind, subjectId })
			if (!dashboardAccess) {
				return context.json({ error: "not found" }, 404)
			}
			const { readAccess, subject } = dashboardAccess
			const dashboard = await loadDashboard({ dashboardKind, subjectId, selection, readAccess })

			// a public read is shared at the edge under the Dashboard's tag, and a full one is never stored
			const response = context.json({ subject, ...dashboard })
			setDashboardCacheHeaders({
				request: context.req.raw,
				response,
				isPublic: readAccess !== "full",
				cacheTag: toDashboardCacheTag({ dashboardKind, subjectId }),
			})
			return response
		},
	)
	// what a Dashboard page puts in its head, from the public snapshot alone. a private team is not found
	.get("/dashboards/:dashboardKind/:subjectId/head", zValidator("param", dashboardParam), async (context) => {
		const { dashboardKind, subjectId } = context.req.valid("param")
		const pageHead = await loadDashboardPageHead(dashboardKind, subjectId)
		return pageHead ? context.json(pageHead) : context.json({ error: "not found" }, 404)
	})
	// the public share image the page head's og:image names, immutable at its hash and purged with the Dashboard
	.get(
		"/dashboards/:dashboardKind/:subjectId/share-image/:imageFile",
		zValidator("param", dashboardParam),
		async (context) => {
			const contentHash = SHARE_IMAGE_FILE_PATTERN.exec(context.req.param("imageFile"))?.[1]
			if (!contentHash) {
				return context.json({ error: "not found" }, 404)
			}

			// the image the public summary names at that hash, or nothing for an old or missing one
			const subject = context.req.valid("param")
			const imageKey = await loadDashboardShareImageKey(subject, contentHash)
			if (!imageKey) {
				return context.json({ error: "not found" }, 404)
			}

			// the png streams from object storage, cached for a year at its versioned url
			return context.body(attachmentStream(imageKey), 200, {
				...toVersionedImageHeaders(true),
				"Cache-Tag": toDashboardCacheTag(subject),
				"Content-Type": "image/png",
			})
		},
	)
