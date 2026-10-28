import type { TopicPageResult } from "@carlnotes/client/topicClient"
import { useTopicFindingActions } from "@carlnotes/core/hooks/useTopicFindingActions"
import {
	applyFindingChange,
	applyFindingChanges,
	type TopicFindingChange,
} from "@carlnotes/core/lib/topicFindingChanges"
import { useQueryClient } from "@tanstack/react-query"
import { usePathname } from "expo-router"
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
	useSyncExternalStore,
} from "react"
import { TopicResourceInfo, type TopicResourceInfoProps } from "@/components/topic/TopicResourceInfo"

// the open finding outlives its filtered or recycled row
type OpenTopicResourceInfo = Omit<TopicResourceInfoProps, "onClose">
type TopicResourceInfoContextValue = {
	findingId: string | null
	open: (props: OpenTopicResourceInfo) => void
}
const TopicResourceInfoContext = createContext<TopicResourceInfoContextValue | null>(null)

/**
 * Keeps finding details open through filtering, sorting, and acknowledged actions.
 */
export function TopicResourceInfoProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
	// retain confirmed details independently of the row's lifetime
	const [selection, setSelection] = useState<OpenTopicResourceInfo | null>(null)
	const pathname = usePathname()
	// biome-ignore lint/correctness/useExhaustiveDependencies: navigation and account changes retire the selection
	useEffect(() => setSelection(null), [pathname, userId])
	// observe access without changing the Topic query's fetch options
	const client = useQueryClient()
	const subscribe = useCallback((onChange: () => void) => client.getQueryCache().subscribe(onChange), [client])
	const isUnavailable = useSyncExternalStore(subscribe, () => {
		const page = client.getQueryData<TopicPageResult>(["topic-page", userId, selection?.topic.id])
		return Boolean(page && page.status !== "visible")
	})
	useEffect(() => {
		if (isUnavailable) {
			setSelection(null)
		}
	}, [isUnavailable])
	const handleChangeConfirmed = (change: TopicFindingChange): void => {
		setSelection((currentSelection) =>
			currentSelection?.resource.findingId === change.findingId
				? { ...currentSelection, resource: applyFindingChange(currentSelection.resource, change) }
				: currentSelection,
		)
	}
	const actions = useTopicFindingActions({
		userId,
		shouldUpdateOptimistically: true,
		onChangeConfirmed: handleChangeConfirmed,
	})

	// overlay pending changes without keeping them after a failed request
	const resource = selection?.resource
	const isPending = actions.pendingChanges.some((change) => change.findingId === resource?.findingId)
	const presentedResource = resource ? applyFindingChanges(resource, actions.pendingChanges) : resource
	const context = pathname !== "/storybook" ? { findingId: resource?.findingId ?? null, open: setSelection } : null
	return (
		<TopicResourceInfoContext.Provider value={context}>
			{children}
			{context && selection && presentedResource && !isUnavailable ? (
				<TopicResourceInfo
					key={presentedResource.findingId}
					{...selection}
					resource={presentedResource}
					topicFeedHandlers={actions.handlers}
					isPending={isPending}
					onClose={() => setSelection(null)}
				/>
			) : null}
		</TopicResourceInfoContext.Provider>
	)
}

/**
 * Returns the screen's finding sheet host, with local sheets available to isolated stories.
 */
export function useTopicResourceInfo(): TopicResourceInfoContextValue | null {
	return useContext(TopicResourceInfoContext)
}
