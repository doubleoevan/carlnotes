import type { TopicResponse } from "@shared/contracts/topics"
import { isTopicSlugStale, toTopicPath } from "@shared/seo"
import { useMatch, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { type FetchTopicPageOptions, fetchTopicPage, type TopicGate } from "@/clients/topicClient"
import { useLoadInBrowser } from "@/hooks/useBrowserValue"
import { useTopicChangeCount } from "@/stores/chatPanelStore"

/**
 * Returns a poll reload's topic page with the related topics of the page it replaces. A topic the page did not show
 * keeps the reload's own.
 */
export function toPolledTopicPage(
	previousTopic: TopicResponse | null | undefined,
	polledTopic: TopicResponse | null,
): TopicResponse | null {
	if (!polledTopic || previousTopic?.id !== polledTopic.id) {
		return polledTopic
	}
	return { ...polledTopic, relatedTopics: previousTopic.relatedTopics }
}

// the topic id from the url, and the slug if the url has one
type UseTopicPagePayloadOptions = { topicId: string; topicSlug: string | undefined }

/**
 * Returns the topic page payload and how the topic is gated, seeded by the server's read and reloaded on a new topic id
 * or a chat change.
 */
export function useTopicPagePayload({ topicId, topicSlug }: UseTopicPagePayloadOptions): {
	topic: TopicResponse | null | undefined
	topicGate: TopicGate | null
	reloadTopicPage: (fetchTopicPageOptions?: FetchTopicPageOptions) => Promise<void>
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
	// the gate in front of an invite or private topic that the user may not see
	const [topicGate, setTopicGate] = useState<TopicGate | null>(null)

	// fetch the topic page payload, which says whether the topic is visible, gated to this user, or missing
	const reloadTopicPage = useCallback(
		async (fetchTopicPageOptions: FetchTopicPageOptions = {}) => {
			try {
				// a poll reload leaves out the related topics, so the page keeps the ones it loaded
				const topicPage = await fetchTopicPage(topicId, fetchTopicPageOptions)
				const fetchedTopic = topicPage.status === "visible" ? topicPage.topic : null
				setTopic((previousTopic) =>
					fetchTopicPageOptions.isPoll ? toPolledTopicPage(previousTopic, fetchedTopic) : fetchedTopic,
				)
				setTopicGate(topicPage.status === "gated" ? topicPage.topicGate : null)
			} catch (error) {
				console.error("topic page load failed", error)
				setTopic(null)
			}
		},
		[topicId],
	)
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
			navigate({ to: toTopicPath(topic), replace: true })
		}
	}, [topic, topicId, topicSlug, navigate])

	// reload the page each time the chat panel reports this topic changed
	const topicChangeCount = useTopicChangeCount(topic?.id ?? null)
	useEffect(() => {
		if (topicChangeCount > 0) {
			void reloadTopicPage()
		}
	}, [topicChangeCount, reloadTopicPage])
	return { topic, topicGate, reloadTopicPage }
}
