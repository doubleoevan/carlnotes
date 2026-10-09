// the analytics of the bots that fetch the site: a crawler reading a page, an unfurler fetching a link's card, and a
// podcast app or a feed reader pulling a feed. an unknown user agent is never named
import { trackBotEvent } from "@shared/analytics"
import { toReportedPath } from "@shared/reportedPath"
import { type Bot, toBot } from "@shared/userAgent"
import type { MiddlewareHandler } from "hono"
import type { AppEnv } from "./currentUser"

// the content types a crawler's fetch is reported for: a page, a feed, the sitemap, and the llms files
const CRAWLED_CONTENT_TYPE_PATTERN = /^(text\/html|text\/plain|text\/xml|application\/xml|application\/rss\+xml)/

// the content types a feed is served as
const FEED_CONTENT_TYPE_PATTERN = /^(application\/rss\+xml|application\/xml|text\/xml)/

/**
 * Reports what a known bot fetched once the route has answered: a crawler's page, feed, sitemap, or llms file, an
 * unfurler's page or preview card, and a podcast app's or a feed reader's feed. A HEAD, a non-200 response, and an
 * image, script, style, or font response report nothing.
 */
export const trackBotFetches: MiddlewareHandler<AppEnv> = async (context, next) => {
	await next()

	// read the bot, and stop for an unknown one, a HEAD, or a response that is not a 200
	const bot = toBot(context.req.header("user-agent"))
	if (!bot || context.req.method !== "GET" || context.res.status !== 200) {
		return
	}

	// the route's shape with no id, and the public topic the route loaded, if it loaded one
	const { pathname } = new URL(context.req.url)
	const routeShape = toReportedPath(pathname)
	const analyticsTopic = context.get("analyticsTopic")
	const topicProperties = analyticsTopic?.isPublic ? { topicId: analyticsTopic.topicId } : {}
	const contentType = context.res.headers.get("content-type") ?? ""
	trackBotFetch({ bot, routeShape, pathname, contentType, topicProperties })
}

// one bot's fetch: the bot, the path and its reported shape, the response's content type, and the public topic's id
type TrackBotFetchOptions = {
	bot: Bot
	routeShape: string
	pathname: string
	contentType: string
	topicProperties: { topicId?: string }
}

// report the fetch by the bot's kind and what it was answered with
function trackBotFetch({ bot, routeShape, pathname, contentType, topicProperties }: TrackBotFetchOptions): void {
	// a crawler reading a page, a feed, the sitemap, or an llms file
	if (bot.kind === "crawler" && CRAWLED_CONTENT_TYPE_PATTERN.test(contentType)) {
		trackBotEvent("crawler_fetched", bot.name, { entryPoint: "web", botName: bot.name, routeShape, status: 200 })
		return
	}

	// an unfurler fetching a page or a link's preview card. the route's first segment names what the link is to
	const isPreviewCard = pathname.endsWith("/preview.png")
	if (bot.kind === "unfurler" && (isPreviewCard || contentType.startsWith("text/html"))) {
		const linkedPageKind = routeShape.split("/").find((segment) => segment && segment !== "api") ?? "home"
		trackBotEvent("link_unfurled", bot.name, {
			entryPoint: "web",
			botName: bot.name,
			kind: linkedPageKind,
			routeShape,
			...topicProperties,
		})
		return
	}

	// a podcast app or a feed reader pulling a feed
	if ((bot.kind === "podcastApp" || bot.kind === "feedReader") && FEED_CONTENT_TYPE_PATTERN.test(contentType)) {
		const feedKind = pathname.includes("podcast") ? "podcast" : "rss"
		trackBotEvent("feed_fetched", bot.name, {
			entryPoint: "feed",
			client: bot.name,
			feedKind,
			routeShape,
			...topicProperties,
		})
	}
}
