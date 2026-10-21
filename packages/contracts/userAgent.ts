// what a user agent says about the browser it came from. the ui reads its own, the api reads the request header

// the tokens the apps that send us traffic put in their user agent
const IN_APP_BROWSER_TOKENS = ["LinkedInApp", "Instagram", "FBAN", "FBAV", "; wv)"]

// an iPad running iPadOS reports itself as a Mac, so it counts as desktop here, the same way it renders
const MOBILE_USER_AGENT_PATTERN = /Mobi|Android|iPhone|iPod|IEMobile/i

// the platform decides the way out of a webview, so it is read apart from which app is hosting one
export type BrowserPlatform = "android" | "ios" | "other"

/**
 * Whether the user agent belongs to an app's embedded browser instead of a browser of its own.
 * This is a guess: it can be spoofed and it misses a webview we have no token for.
 */
export function isInAppBrowser(userAgent: string): boolean {
	return IN_APP_BROWSER_TOKENS.some((token) => userAgent.includes(token))
}

/**
 * The platform the user agent belongs to, which determines what we show for login in an embedded browser.
 * Android can be handed an intent url. iOS has no equivalent. Anything else needs neither.
 */
export function toBrowserPlatform(userAgent: string): BrowserPlatform {
	if (userAgent.includes("Android")) {
		return "android"
	}

	// match an iOS device by name. an iPad on iPadOS reports as a Mac and reads as other
	const isIosDevice = /iPhone|iPad|iPod/.test(userAgent)
	return isIosDevice ? "ios" : "other"
}

/**
 * Which kind of device a request came from. Only meaningful for events that a browser triggered.
 */
export function toPlatform(userAgent: string | null | undefined): "mobile" | "desktop" {
	return userAgent && MOBILE_USER_AGENT_PATTERN.test(userAgent) ? "mobile" : "desktop"
}

// a user agent's platform, browser platform, and whether it is an in-app browser
export type DeviceProperties = {
	platform: "mobile" | "desktop"
	browserPlatform: BrowserPlatform
	isInAppBrowser: boolean
}

/**
 * The three device properties of a request's user agent. No user agent reads as desktop, other, and not an in-app
 * browser.
 */
export function toDeviceProperties(userAgent: string | null | undefined): DeviceProperties {
	return {
		platform: toPlatform(userAgent),
		browserPlatform: toBrowserPlatform(userAgent ?? ""),
		isInAppBrowser: isInAppBrowser(userAgent ?? ""),
	}
}

// what a bot does: crawl pages for a search or AI index, unfurl a link into a card, or pull a feed as a podcast app
// or a feed reader
export type BotKind = "crawler" | "unfurler" | "podcastApp" | "feedReader"

// a known bot or app, by its kind and name
export type Bot = { kind: BotKind; name: string }

// the tokens that name a bot in its user agent, matched without case in this order
const BOT_TOKENS: { token: string; name: string; kind: BotKind }[] = [
	// the search and AI crawlers
	{ token: "Googlebot", name: "googlebot", kind: "crawler" },
	{ token: "bingbot", name: "bingbot", kind: "crawler" },
	{ token: "DuckDuckBot", name: "duckduckbot", kind: "crawler" },
	{ token: "Applebot", name: "applebot", kind: "crawler" },
	{ token: "YandexBot", name: "yandexbot", kind: "crawler" },
	{ token: "Baiduspider", name: "baiduspider", kind: "crawler" },
	{ token: "PetalBot", name: "petalbot", kind: "crawler" },
	{ token: "GPTBot", name: "gptbot", kind: "crawler" },
	{ token: "ChatGPT-User", name: "chatgpt-user", kind: "crawler" },
	{ token: "OAI-SearchBot", name: "oai-searchbot", kind: "crawler" },
	{ token: "ClaudeBot", name: "claudebot", kind: "crawler" },
	{ token: "Claude-User", name: "claude-user", kind: "crawler" },
	{ token: "Claude-SearchBot", name: "claude-searchbot", kind: "crawler" },
	{ token: "PerplexityBot", name: "perplexitybot", kind: "crawler" },
	{ token: "Perplexity-User", name: "perplexity-user", kind: "crawler" },
	{ token: "Bytespider", name: "bytespider", kind: "crawler" },
	{ token: "CCBot", name: "ccbot", kind: "crawler" },
	{ token: "Amazonbot", name: "amazonbot", kind: "crawler" },
	{ token: "meta-externalagent", name: "meta-externalagent", kind: "crawler" },
	{ token: "AhrefsBot", name: "ahrefsbot", kind: "crawler" },
	{ token: "SemrushBot", name: "semrushbot", kind: "crawler" },
	// the link unfurlers
	{ token: "Slackbot", name: "slack", kind: "unfurler" },
	{ token: "Twitterbot", name: "twitter", kind: "unfurler" },
	{ token: "LinkedInBot", name: "linkedin", kind: "unfurler" },
	{ token: "Discordbot", name: "discord", kind: "unfurler" },
	{ token: "facebookexternalhit", name: "facebook", kind: "unfurler" },
	{ token: "WhatsApp", name: "whatsapp", kind: "unfurler" },
	{ token: "TelegramBot", name: "telegram", kind: "unfurler" },
	{ token: "Mastodon", name: "mastodon", kind: "unfurler" },
	{ token: "Bluesky Cardyb", name: "bluesky", kind: "unfurler" },
	// the podcast apps
	{ token: "Overcast", name: "overcast", kind: "podcastApp" },
	{ token: "PocketCasts", name: "pocket-casts", kind: "podcastApp" },
	{ token: "Spotify", name: "spotify", kind: "podcastApp" },
	{ token: "Castro", name: "castro", kind: "podcastApp" },
	{ token: "Podcast Addict", name: "podcast-addict", kind: "podcastApp" },
	{ token: "AntennaPod", name: "antennapod", kind: "podcastApp" },
	{ token: "Castbox", name: "castbox", kind: "podcastApp" },
	{ token: "iTMS", name: "apple-podcasts", kind: "podcastApp" },
	{ token: "Podcasts/", name: "apple-podcasts", kind: "podcastApp" },
	{ token: "AppleCoreMedia", name: "apple-podcasts", kind: "podcastApp" },
	{ token: "gPodder", name: "gpodder", kind: "podcastApp" },
	// the feed readers
	{ token: "Feedly", name: "feedly", kind: "feedReader" },
	{ token: "Inoreader", name: "inoreader", kind: "feedReader" },
	{ token: "NewsBlur", name: "newsblur", kind: "feedReader" },
	{ token: "Feedbin", name: "feedbin", kind: "feedReader" },
	{ token: "NetNewsWire", name: "netnewswire", kind: "feedReader" },
	{ token: "Reeder", name: "reeder", kind: "feedReader" },
	{ token: "Miniflux", name: "miniflux", kind: "feedReader" },
	{ token: "FreshRSS", name: "freshrss", kind: "feedReader" },
	{ token: "theoldreader", name: "the-old-reader", kind: "feedReader" },
]

/**
 * The first product token of a user agent, without its version and in lower case, or "unknown" for none.
 */
export function toUserAgentProduct(userAgent: string | null | undefined): string {
	const productToken = userAgent?.trim().split(/[\s/]/, 1)[0]?.toLowerCase()
	return productToken || "unknown"
}

/**
 * The bot or app a user agent names, or null for a user agent on no list.
 */
export function toBot(userAgent: string | null | undefined): Bot | null {
	if (!userAgent) {
		return null
	}

	// find the first listed token the user agent contains, without case
	const lowerUserAgent = userAgent.toLowerCase()
	const botToken = BOT_TOKENS.find(({ token }) => lowerUserAgent.includes(token.toLowerCase()))
	return botToken ? { kind: botToken.kind, name: botToken.name } : null
}
