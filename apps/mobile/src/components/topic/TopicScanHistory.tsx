import { showClientError } from "@carlnotes/client/apiClient"
import { authClient } from "@carlnotes/client/authClient"
import { fetchScanNote, removeTopicSource } from "@carlnotes/client/topicClient"
import { KEEP_ONE_SOURCE_MESSAGE } from "@carlnotes/contracts/sources"
import type { TopicResponse, TopicScan } from "@carlnotes/contracts/topics"
import { usePagination } from "@carlnotes/core/hooks/usePagination"
import { toScanTimestamp } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type ComponentRef, useRef, useState } from "react"
import { Alert, Pressable, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { Pagination } from "@/components/common/Pagination"
import { Sheet } from "@/components/common/Sheet"
import type { SourceRemoval } from "@/components/common/SourceResultsChart"
import { PodcastEpisodeNumberPill } from "@/components/podcast/PodcastEpisodePill"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "./CollapsibleSection"
import { TopicScanRecap } from "./TopicScanRecap"

/**
 * Shows the delivered scan history with native sheets for individual scan notes.
 */
export function TopicScanHistory({ topic }: { topic: TopicResponse }) {
	// use the web's five-row pages while keeping each scan's note lazy
	const { pageRows: scans, pagination } = usePagination(topic.scans, 5)
	return (
		<CollapsibleSection title="Brew diary">
			<View className="rounded-lg border border-separator bg-card p-1 shadow-raised">
				{scans.length === 0 ? (
					<Text className="py-3 pl-2 text-sm text-muted-foreground">{"Carl hasn't scanned this topic yet."}</Text>
				) : null}
				{scans.map((scan, i) => (
					<ScanRow key={scan.id} topic={topic} scan={scan} isLast={i === scans.length - 1} />
				))}
			</View>
			<Pagination
				label="Brew diary"
				pageNumber={pagination.page + 1}
				pageCount={pagination.pageCount}
				onOpenPage={(page) => pagination.setPage(page - 1)}
			/>
		</CollapsibleSection>
	)
}

// keep the scan's trigger available for accessibility focus return
function ScanRow({ topic, scan, isLast }: { topic: TopicResponse; scan: TopicScan; isLast: boolean }) {
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const timestamp = toScanTimestamp(scan)
	return (
		<>
			{/* keep the whole row as a note trigger, with the episode pill independent of it */}
			<Pressable
				accessible={false}
				onPress={() => setIsOpen(true)}
				className={cn(
					"flex-row items-center gap-3 py-2.5 pr-1 pl-2 active:bg-accent",
					!isLast && "border-b border-dashed border-separator-strong",
				)}
			>
				{/* allow timestamp and counts to wrap at large text sizes without crowding the controls */}
				<View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
					<Text className="text-sm">{timestamp}</Text>
					<ScanStat scan={scan} />
				</View>
				{/* reuse the same episode pill and notebook tile as the other Topic cards */}
				<PodcastEpisodeNumberPill podcastEpisode={scan.podcastEpisode} />
				<Pressable
					ref={triggerRef}
					accessibilityRole="button"
					accessibilityLabel={`Brew note from Carl, ${timestamp}`}
					accessibilityState={{ expanded: isOpen }}
					hitSlop={toTouchTargetHitSlop(44)}
					onPress={(event) => {
						event.stopPropagation()
						setIsOpen(true)
					}}
					className="min-h-11 min-w-11 shrink-0 items-center justify-center active:opacity-75"
				>
					<NoteIcon />
				</Pressable>
			</Pressable>
			{isOpen ? (
				<Sheet title="Dear Diary" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					<ScanNote topic={topic} scan={scan} />
				</Sheet>
			) : null}
		</>
	)
}

// distinguish completed counts, failed scans, and work still in progress
function ScanStat({ scan }: { scan: TopicScan }) {
	if (scan.status === "succeeded") {
		return (
			<Text className="text-xs text-muted-foreground">
				read {scan.foundCount} · kept {scan.keptCount}
			</Text>
		)
	}
	if (scan.status === "failed") {
		return <Text className="text-xs text-destructive">failed</Text>
	}
	return <CoffeeLoading isSmall />
}

// fetch only the opened note and never persist its payload
function ScanNote({ topic, scan }: { topic: TopicResponse; scan: TopicScan }) {
	// load only this scan and keep source edits inside the open diary
	const { data: session } = authClient().useSession()
	const sourceRemoval = useSourceRemoval(topic)
	const query = useQuery({
		queryKey: ["mobile-scan-note", session?.user.id, scan.id],
		queryFn: () => fetchScanNote(scan.id),
		gcTime: 0,
	})
	if (query.isPending) {
		return <CoffeeLoading label="Loading your brew note" />
	}
	if (query.isError) {
		return (
			<Button variant="outline" accessibilityLabel="Retry brew note" onPress={() => void query.refetch()}>
				<Text>Try again</Text>
			</Button>
		)
	}
	return (
		<TopicScanRecap
			scan={{ ...scan, ...query.data }}
			topic={topic}
			findings={topic.findings.filter((finding) => finding.scanId === scan.id)}
			sourceRemoval={sourceRemoval}
		/>
	)
}

// confirm an editor's source removal and refresh both reading views after it succeeds
function useSourceRemoval(topic: TopicResponse): SourceRemoval | undefined {
	// keep historical rows while removing their action after an acknowledged edit
	const queryClient = useQueryClient()
	const { data: session } = authClient().useSession()
	const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
	const isRemovingRef = useRef(false)
	const sources = topic.sources.filter((source) => !removedIds.has(source.id))

	// leave the diary open during confirmation and the request
	const handleRemoveSource = (sourceId: string, label: string): void => {
		if (sources.length <= 1) {
			showClientError(KEEP_ONE_SOURCE_MESSAGE)
			return
		}
		Alert.alert("Remove this source?", `Carl stops reading ${label} on later brews. Past brews keep what it found.`, [
			{ text: "Keep it", style: "cancel" },
			{ text: "Remove source", style: "destructive", onPress: () => void handleConfirmRemoval(sourceId) },
		])
	}

	// protect against repeated confirmation and reflect only a completed deletion
	const handleConfirmRemoval = async (sourceId: string): Promise<void> => {
		if (isRemovingRef.current) {
			return
		}
		isRemovingRef.current = true
		try {
			const status = await removeTopicSource(topic.id, sourceId)
			if (status !== "removed") {
				showClientError(status === "lastSource" ? KEEP_ONE_SOURCE_MESSAGE : "That didn't go through. Try again.")
				return
			}
			setRemovedIds((ids) => new Set([...ids, sourceId]))
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["topic-page", session?.user.id, topic.id] }),
				queryClient.invalidateQueries({ queryKey: ["topic-feed", session?.user.id] }),
			])
		} catch {
			showClientError("That didn't go through. Try again.")
		} finally {
			isRemovingRef.current = false
		}
	}
	return topic.canEdit
		? {
				removableSourceIds: new Set(
					sources.filter((source) => source.sourceKind !== "search").map((source) => source.id),
				),
				onRemoveSource: handleRemoveSource,
			}
		: undefined
}
