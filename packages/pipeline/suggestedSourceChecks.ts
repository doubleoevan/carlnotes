// resolve a suggested Source to the value its ingester stores, and check that its ingester can read it
import { toGoogleNewsPublisherFeedUrl, toPublisherDomain } from "@carlnotes/contracts/sources"
import { withTimeLimit } from "@carlnotes/contracts/time"
import {
	FetchStatusError,
	fetchPublicUrl,
	isRetryableFetchFailure,
	readLimitedBody,
} from "@carlnotes/server/publicFetch"
import { fetchAuthorFeed } from "./ingest/bluesky"
import { fetchFeed } from "./ingest/feed"
import { searchPodcasts } from "./ingest/podcast"
import { fetchSubredditFeed, toSubredditName } from "./ingest/reddit"
import { readHandle } from "./ingest/x"
import { toAtomUrl, toYoutubeSourceId } from "./ingest/youtube"
import type { SuggestedSource } from "./suggest"

// how long a verification fetch may run. a slow suggested source is dropped instead of delaying the reply
const VERIFY_TIMEOUT_MS = 8000

/**
 * Returns the suggestion as its ingester will store it, or null if the channel or show it names is not found.
 */
export async function toResolvedSource(suggestedSource: SuggestedSource): Promise<SuggestedSource | null> {
	// look up a channel or a show, and drop a value that names neither
	if (suggestedSource.sourceOption === "youtube") {
		return toResolvedYoutubeSource(suggestedSource)
	}
	if (suggestedSource.sourceOption === "podcast") {
		return toResolvedPodcastSource(suggestedSource)
	}

	// name a publisher written as a url by its bare domain
	if (suggestedSource.sourceOption === "googleNews") {
		return { ...suggestedSource, value: toPublisherDomain(suggestedSource.value) ?? suggestedSource.value }
	}

	// read a feed or a page written without its scheme over https
	if (suggestedSource.sourceOption === "rss" || suggestedSource.sourceOption === "url") {
		const url = /^https?:\/\//i.test(suggestedSource.value) ? suggestedSource.value : `https://${suggestedSource.value}`

		// resolve a page proposed as a feed to the feed that the page's link tags advertise
		const value = suggestedSource.sourceOption === "rss" ? await toAdvertisedFeedUrl(url) : url
		return { ...suggestedSource, value }
	}

	// every other kind names what its Source stores already
	return suggestedSource
}

// a channel suggestion as the channel or playlist id that its value names, or null if the value names neither
async function toResolvedYoutubeSource(suggestedSource: SuggestedSource): Promise<SuggestedSource | null> {
	const youtubeId = await toYoutubeSourceId(suggestedSource.value)

	// drop a value that names no channel or playlist
	if (!youtubeId) {
		console.log(`dropped a youtube suggestion that named no channel or playlist: ${suggestedSource.value}`)
		return null
	}

	// a username is what the channel is called, so the username shows as the name until a scan stores the real title
	const username = suggestedSource.value.trim()
	return { ...suggestedSource, value: youtubeId, name: username.startsWith("@") ? username : undefined }
}

// a show suggestion as the id of the first iTunes show of that name that publishes a feed, or null if iTunes finds none
async function toResolvedPodcastSource(suggestedSource: SuggestedSource): Promise<SuggestedSource | null> {
	// search iTunes for the suggested name, and keep the show of that exact name that publishes a feed,
	// or else the first show with a feed where either name holds the other
	const podcasts = await searchPodcasts(suggestedSource.value).catch(() => [])
	const feedPodcasts = podcasts.filter((foundPodcast) => foundPodcast.feedUrl)
	const comparableSuggestedName = toComparableShowName(suggestedSource.value)
	const podcast =
		feedPodcasts.find(
			(foundPodcast) =>
				comparableSuggestedName !== "" && toComparableShowName(foundPodcast.name) === comparableSuggestedName,
		) ??
		feedPodcasts.find((foundPodcast) =>
			isSameShowName({ suggestedName: suggestedSource.value, showName: foundPodcast.name }),
		)

	// drop a name that finds no show with a feed, and return the show's id and the show's name
	if (!podcast) {
		console.log(`dropped a podcast suggestion naming no show that publishes a feed: ${suggestedSource.value}`)
		return null
	}
	return { ...suggestedSource, value: podcast.podcastId, name: podcast.name }
}

// the name that a suggestion gave a show, and the name of a show that iTunes found
type IsSameShowNameOptions = { suggestedName: string; showName: string }

/**
 * Checks whether either show name holds the other, ignoring case and every character but ascii letters and digits.
 */
export function isSameShowName({ suggestedName, showName }: IsSameShowNameOptions): boolean {
	const comparableSuggestedName = toComparableShowName(suggestedName)
	const comparableShowName = toComparableShowName(showName)
	if (!comparableSuggestedName || !comparableShowName) {
		return false
	}
	return comparableShowName.includes(comparableSuggestedName) || comparableSuggestedName.includes(comparableShowName)
}

// a show name in lower case with only its ascii letters and digits
function toComparableShowName(showName: string): string {
	return showName.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

// the feed that a page's link tags advertise, or the url itself if the url is not a readable html page with a feed link
async function toAdvertisedFeedUrl(url: string): Promise<string> {
	// keep the url if the lookup outlasts the verification deadline, dns lookup included
	const deadline = new Promise<string>((resolve) => setTimeout(() => resolve(url), VERIFY_TIMEOUT_MS))
	return Promise.race([readAdvertisedFeedUrl(url), deadline])
}

// fetch the page and read the feed that its link tags advertise, or keep the url
async function readAdvertisedFeedUrl(url: string): Promise<string> {
	try {
		// fetch the page, and keep the url if the response is not an ok html page
		const response = await fetchPublicUrl(url, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
		if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
			await response.body?.cancel()
			return url
		}

		// resolve the advertised feed against the requested url
		const feedHref = toAdvertisedFeedHref(await readLimitedBody(response, url))
		return feedHref ? new URL(feedHref, url).href : url
	} catch {
		// keep the url of a page that cannot be read
		return url
	}
}

/**
 * Returns the address of the first rss or atom feed link in a page, or undefined if the page has no feed link.
 */
export function toAdvertisedFeedHref(html: string): string | undefined {
	for (const [linkTag] of html.matchAll(/<link\b[^>]*>/gi)) {
		// a feed link is an alternate link of an rss or atom type with an address
		const isFeedLink =
			/\brel=["']?alternate\b/i.test(linkTag) && /\btype=["']?application\/(?:rss|atom)\+xml/i.test(linkTag)
		const feedHref = linkTag.match(/\bhref=["']([^"']+)["']/i)?.[1]

		// return the first feed link's address, with its encoded ampersands decoded
		if (isFeedLink && feedHref) {
			return feedHref.replaceAll("&amp;", "&")
		}
	}
	return undefined
}

/**
 * Checks whether a suggested source can be read, fetched the way its own ingester reads it.
 */
export async function isSuggestedSourceReadable(suggestedSource: SuggestedSource): Promise<boolean> {
	try {
		// a host that hangs counts as temporarily unconfirmed instead of keeping the response open
		await withTimeLimit({
			work: readSuggestedSource(suggestedSource),
			timeLimitMs: VERIFY_TIMEOUT_MS,
			toError: () => new DOMException("verification timed out", "TimeoutError"),
		})
		return true
	} catch (error) {
		// a rate limit or a server error is the host saying "not now", not "no such source"
		if (isTemporaryFailure(error, suggestedSource.sourceOption)) {
			console.log(`kept a ${suggestedSource.sourceOption} suggestion the host would not confirm: ${String(error)}`)
			return true
		}
		console.log(`dropped an unreadable ${suggestedSource.sourceOption} suggestion: ${String(error)}`)
		return false
	}
}

/**
 * Whether the host would not answer instead of answering that the source is not there.
 */
export function isTemporaryFailure(error: unknown, sourceOption: SuggestedSource["sourceOption"]): boolean {
	// reddit returns 403 to every request from an IP range it blocks
	const isRedditBlock = sourceOption === "reddit" && error instanceof FetchStatusError && error.status === 403
	return isRedditBlock || isRetryableFetchFailure(error)
}

// read the suggested source through the same helper its ingester uses
async function readSuggestedSource(suggestedSource: SuggestedSource): Promise<void> {
	// a subreddit is confirmed through the keyless feed the reddit ingester falls back to
	if (suggestedSource.sourceOption === "reddit") {
		const subreddit = toSubredditName(suggestedSource.value)
		if (!subreddit) {
			throw new Error(`${suggestedSource.value} is not a subreddit name reddit would accept`)
		}
		await fetchSubredditFeed(subreddit)
		return
	}

	// a podcast was already resolved from a show name to its id, which only succeeds for a show iTunes lists
	if (suggestedSource.sourceOption === "podcast") {
		return
	}

	// a channel or playlist is confirmed through its Atom feed, which is the YouTube ingester's keyless path
	if (suggestedSource.sourceOption === "youtube") {
		await fetchFeed(toAtomUrl(suggestedSource.value), { resourceKind: "watch" })
		return
	}

	// a Google News source is confirmed through the publisher feed stored for it
	if (suggestedSource.sourceOption === "googleNews") {
		const publisherFeedUrl = toGoogleNewsPublisherFeedUrl(suggestedSource.value)
		if (!publisherFeedUrl) {
			throw new Error(`a google news suggestion named no publisher domain: ${suggestedSource.value}`)
		}

		// Google returns an empty feed for a publisher it never heard of, so an empty one is a publisher that isn't there
		const publisherArticles = await fetchFeed(publisherFeedUrl)
		if (publisherArticles.length === 0) {
			throw new Error(`google news has nothing from ${suggestedSource.value}`)
		}
		return
	}

	// a feed has to parse as a feed. a page that merely returns 200 is not a valid feed
	if (suggestedSource.sourceOption === "rss") {
		await fetchFeed(suggestedSource.value)
		return
	}

	// a bluesky account is confirmed through the same keyless appview its ingester uses, asking for one post
	if (suggestedSource.sourceOption === "bluesky") {
		await fetchAuthorFeed(suggestedSource.value.replace(/^@/, ""), 1)
		return
	}

	// an x username is confirmed by looking the account up instead of reading its tweets
	if (suggestedSource.sourceOption === "x") {
		await readHandle(suggestedSource.value)
		return
	}

	// a page only has to answer
	const response = await fetchPublicUrl(suggestedSource.value, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
	if (!response.ok) {
		throw new FetchStatusError(suggestedSource.value, response.status)
	}
}
