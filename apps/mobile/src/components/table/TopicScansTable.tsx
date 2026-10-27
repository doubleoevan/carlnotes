import { authClient } from "@carlnotes/client/authClient"
import { fetchScanNote, fetchTopicPage } from "@carlnotes/client/topicClient"
import type { ActivityScan, OwnerTopic } from "@carlnotes/contracts/activity"
import { durationMsBetween, toDurationLabel } from "@carlnotes/core/lib/labels"
import { scanSortValues, toTopicScansTableColumns } from "@carlnotes/core/lib/topicScansTableColumns"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { TopicScanRecap } from "@/components/topic/TopicScanRecap"
import { DataTable } from "./DataTable"

/**
 * Renders the shared scan history columns and recap.
 */
export function TopicScansTable({ scans, topic }: { scans: ActivityScan[]; topic: Pick<OwnerTopic, "id" | "name"> }) {
	const columns = toTopicScansTableColumns({
		scans,
		renderText: (text) => <Text className="text-sm">{text}</Text>,
		renderTime: (scan) => <ScanNotesCell scan={scan} topic={topic} />,
	})
	if (!scans.length) {
		return <Text className="text-sm text-muted-foreground">No brews this month.</Text>
	}
	return <DataTable rows={scans} columns={columns} valueByKey={scanSortValues} getRowId={(scan) => scan.id} />
}

// load the selected scan recap for the current account
function ScanNotesCell({ scan, topic }: { scan: ActivityScan; topic: Pick<OwnerTopic, "id" | "name"> }) {
	// retain the table while its details are open
	const { data: session } = authClient().useSession()
	const [isOpen, setIsOpen] = useState(false)
	const query = useQuery({
		queryKey: ["scan-note", session?.user.id, scan.id],
		queryFn: async () => {
			const page = await fetchTopicPage(topic.id)
			if (page.status !== "visible") {
				return null
			}
			const scanNote = await fetchScanNote(scan.id)
			if (!scanNote) {
				return null
			}
			return { scanNote, topic: page.topic }
		},
		enabled: isOpen,
	})
	const duration = toDurationLabel(durationMsBetween(scan.startedAt, scan.finishedAt)) || "—"
	return (
		<>
			<Button
				variant="link"
				className="px-0"
				accessibilityLabel={`Brew time ${duration}, show Carl's notes`}
				onPress={() => setIsOpen(true)}
			>
				<Text>{duration}</Text>
			</Button>
			{isOpen && (
				<Sheet title="Dear Diary" onClose={() => setIsOpen(false)}>
					{query.data === null && <Text>This brew is unavailable.</Text>}
					{query.data ? (
						<TopicScanRecap
							scan={{ ...scan, ...query.data.scanNote, costDollars: scan.costCents / 100 }}
							topic={query.data.topic}
							findings={query.data.topic.findings.filter((finding) => finding.scanId === scan.id)}
						/>
					) : query.isPending ? (
						<CoffeeLoading />
					) : query.isError ? (
						<Button variant="secondary" accessibilityLabel="Retry brew notes" onPress={() => void query.refetch()}>
							<Text>Try again</Text>
						</Button>
					) : null}
				</Sheet>
			)}
		</>
	)
}
