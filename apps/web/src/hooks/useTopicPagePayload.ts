import {
	type FetchTopicPageOptions,
	fetchRelatedTopics,
	fetchTopicPage,
	type TopicGate,
} from "@carlnotes/client/topicClient"
import { isTopicSlugStale, toTopicPath } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toPolledTopicPage } from "@carlnotes/core/lib/scanPoll"
import { applyTopicFindingChanges, type TopicFindingChange } from "@carlnotes/core/lib/topicFindingChanges"
import { useMatch, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTopicChangeCount } from "@/stores/chatPanelStore"
import { useLoadInBrowser } from "./useBrowserValue"
import { useIsSignedInBeforeSession } from "./useIsSignedInBeforeSession"

// the topic id from the url, and the slug if the url has one
type UseTopicPagePayloadOptions = { topicId: string; topicSlug: string | undefined }

/**
 * Returns the topic page payload and how the topic is gated, seeded by the server's read and reloaded on a new topic id
 * or a chat change. A signed-in reader's page loads without its related topics, which arrive from a read of their own.
 */
export function useTopicPagePayload({ topicId, topicSlug }: UseTopicPagePayloadOptions): {
	topic: TopicResponse | null | undefined
	topicGate: TopicGate | null
	reloadTopicPage: (fetchTopicPageOptions?: FetchTopicPageOptions) => Promise<void>
	changeTopicFinding: (change: TopicFindingChange) => void
} {
	const navigate = useNavigate()
	// the public topic either topic route loads on the server, or nothing
	const loadedTopicById = useMatch({
		from: "/_layout/topics/$topicId",
		shouldThrow: false,
		select: (topicMatch) => topicMatch.loaderData?.topic,
	})
	const loadedTopicBySlug = useMatch({
		from: "/_layout/topics/$topicId_/$topicSlug",
		shouldThrow: false,
		select: (topicMatch) => topicMatch.loaderData?.topic,
	})
	const loadedTopic = loadedTopicById ?? loadedTopicBySlug
	// the topic page payload. undefined while loading, null if missing or not visible
	const [topic, setTopic] = useState<TopicResponse | null | undefined>(loadedTopic ?? undefined)
	// the gate in front of an invite topic that the user may not see
	const [topicGate, setTopicGate] = useState<TopicGate | null>(null)

	// the topic id the page shows now, written once the render commits, so a reload's response for a topic the page
	// left is dropped
	const shownTopicIdRef = useRef(topicId)
	useEffect(() => {
		shownTopicIdRef.current = topicId
	}, [topicId])

	// how many reloads this hook started, which tells a finished read whether a later reload replaced it
	const reloadCountRef = useRef(0)

	// whether the reader is signed in, which a reload reads without changing its identity
	const isSignedIn = useIsSignedInBeforeSession()
	const isSignedInRef = useRef(isSignedIn)
	useEffect(() => {
		isSignedInRef.current = isSignedIn
	}, [isSignedIn])

	// fetch the topic page payload, which says whether the topic is visible, gated to this user, or missing
	const reloadTopicPage = useCallback(
		async (fetchTopicPageOptions: FetchTopicPageOptions = {}) => {
			// count this reload, so an earlier one's related topics never replace a later one's
			reloadCountRef.current += 1
			const reloadCount = reloadCountRef.current
			try {
				// a signed-in reader's full load reads the related topics apart from the page, started beside it
				const isRelatedTopicsSeparate = isSignedInRef.current && !fetchTopicPageOptions.isPoll
				const relatedTopicsRead = isRelatedTopicsSeparate ? fetchRelatedTopicsOrNull(topicId) : null

				// a poll reload leaves out the related topics, the reactions, and the comment thread, so the page keeps its own
				const topicPage = await fetchTopicPage(topicId, { ...fetchTopicPageOptions, isRelatedTopicsSeparate })
				if (shownTopicIdRef.current !== topicId) {
					return
				}
				const fetchedTopic = topicPage.status === "visible" ? topicPage.topic : null
				const { isPoll = false } = fetchTopicPageOptions
				setTopic((previousTopic) => toReloadedTopic({ previousTopic, fetchedTopic, isPoll, isRelatedTopicsSeparate }))
				setTopicGate(topicPage.status === "gated" ? topicPage.topicGate : null)

				// add the related topics once their own read arrives, if the page still shows their topic and no later reload
				// started. the reload ends without waiting for them
				void relatedTopicsRead?.then((relatedTopics) => {
					if (reloadCountRef.current === reloadCount) {
						setTopic((shownTopic) => toTopicWithRelatedTopics({ shownTopic, topicId, relatedTopics }))
					}
				})
			} catch (error) {
				console.error("topic page load failed", error)
				// a failed reload for a topic the page left changes nothing on the page that replaced it, and a failed poll
				// keeps the page it reads again
				if (shownTopicIdRef.current === topicId && !fetchTopicPageOptions.isPoll) {
					setTopic(null)
				}
			}
		},
		[topicId],
	)
	// keep a finding's change on the page with no request
	const changeTopicFinding = useCallback((change: TopicFindingChange): void => {
		setTopic((previousTopic) => previousTopic && applyTopicFindingChanges(previousTopic, [change]))
	}, [])

	// keep the topic if its id matches the url, otherwise show the skeleton, then reload the page payload. the first
	// load skips while hydrating the public topic the server loaded, unless a scan was running, whose findings may have
	// changed since
	const resetAndReloadTopicPage = useCallback((): void => {
		setTopic((previousTopic) => (previousTopic?.id === topicId ? previousTopic : undefined))
		setTopicGate(null)
		void reloadTopicPage()
	}, [reloadTopicPage, topicId])
	const isLoadedOnServer =
		loadedTopic?.id === topicId && !loadedTopic.scans.some((topicScan) => topicScan.status === "running")
	useLoadInBrowser({ pageId: topicId, isLoadedOnServer, loadPage: resetAndReloadTopicPage })

	// redirect a url by id alone or with a stale slug to the topic's current path once the url's topic loads
	useEffect(() => {
		if (topic?.id === topicId && isTopicSlugStale(topic, topicSlug)) {
			navigate({ to: toTopicPath(topic), search: (search) => search, replace: true })
		}
	}, [topic, topicId, topicSlug, navigate])

	// reload the page each time the chat panel reports this topic changed
	const topicChangeCount = useTopicChangeCount(topic?.id ?? null)
	useEffect(() => {
		if (topicChangeCount > 0) {
			void reloadTopicPage()
		}
	}, [topicChangeCount, reloadTopicPage])
	return { topic, topicGate, reloadTopicPage, changeTopicFinding }
}

// a topic's related topics from their own read, or null if the read fails
async function fetchRelatedTopicsOrNull(topicId: string): Promise<TopicResponse["relatedTopics"] | null> {
	try {
		return await fetchRelatedTopics(topicId)
	} catch (error) {
		console.error("related topics load failed", error)
		return null
	}
}

// the page a reload replaces, the topic the reload fetched, whether the reload was a poll, and whether it left the
// related topics to their own read
type ToReloadedTopicOptions = {
	previousTopic: TopicResponse | null | undefined
	fetchedTopic: TopicResponse | null
	isPoll: boolean
	isRelatedTopicsSeparate: boolean
}

// the topic a reload shows. a poll keeps what the page it replaces shows of everything a poll leaves out, and a load
// without its related topics keeps the ones that page shows until their own read arrives. a topic the page did not
// show keeps the reload's own
function toReloadedTopic({
	previousTopic,
	fetchedTopic,
	isPoll,
	isRelatedTopicsSeparate,
}: ToReloadedTopicOptions): TopicResponse | null {
	if (isPoll) {
		return toPolledTopicPage(previousTopic, fetchedTopic)
	}

	// a load with its own related topics, a hidden or missing topic, and a topic the page did not show stay as fetched
	if (!isRelatedTopicsSeparate || !fetchedTopic || previousTopic?.id !== fetchedTopic.id) {
		return fetchedTopic
	}
	return { ...fetchedTopic, relatedTopics: previousTopic.relatedTopics }
}

// the topic the page shows, and a topic's related topics from their own read, null if the read failed or never ran
type ToTopicWithRelatedTopicsOptions = {
	shownTopic: TopicResponse | null | undefined
	topicId: string
	relatedTopics: TopicResponse["relatedTopics"] | null
}

// the shown topic with its related topics from their own read. a page that shows another topic, and a read that
// returned nothing, leave the shown topic as it is
function toTopicWithRelatedTopics({
	shownTopic,
	topicId,
	relatedTopics,
}: ToTopicWithRelatedTopicsOptions): TopicResponse | null | undefined {
	return shownTopic?.id === topicId && relatedTopics ? { ...shownTopic, relatedTopics } : shownTopic
}
