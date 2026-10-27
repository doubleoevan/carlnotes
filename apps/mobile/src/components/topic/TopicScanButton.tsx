import { sendManualScan, sendStopScan } from "@carlnotes/client/topicClient"
import { MANUAL_SCAN_PAUSED_LABEL, SCAN_SPENT_BUDGET_LABEL } from "@carlnotes/contracts/scanFailure"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { useManualScanProgress } from "@carlnotes/core/hooks/useManualScanProgress"
import { isManualScanShown } from "@carlnotes/core/lib/topicActions"
import { router } from "expo-router"
import { CirclePause, Coffee } from "lucide-react-native"
import { Alert, View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"
import { usePollWhileScanning } from "@/hooks/useTopicScan"

/**
 * Starts and stops manual scans with shared progress tracking.
 */
export function TopicScanButton({ topic, onScanned }: { topic: TopicResponse; onScanned: () => Promise<void> }) {
	// track manual scan progress and refresh it while the screen is active
	const progress = useManualScanProgress(topic.scans)
	const mutation = usePageMutation(onScanned)
	const isRunning = progress.isScanning || progress.isRunningScan
	usePollWhileScanning({ isScanning: isRunning, reload: onScanned })
	if (!isManualScanShown(topic)) {
		return null
	}
	function handleBlocked(message: string, path: "/account" | "/plans"): void {
		Alert.alert("Brew", message, [
			{ text: "Close", style: "cancel" },
			{ text: path === "/account" ? "See account" : "See plans", onPress: () => router.push(path) },
		])
	}
	async function handleScan(): Promise<void> {
		// check the account budget, pause state, and daily scan allowance
		if (topic.isSpendExhausted) {
			handleBlocked(SCAN_SPENT_BUDGET_LABEL, "/account")
			return
		}
		if (topic.isManualScanPaused) {
			handleBlocked(MANUAL_SCAN_PAUSED_LABEL, "/account")
			return
		}
		if ((topic.manualScansRemaining ?? 0) <= 0) {
			handleBlocked("You have used today's brews.", "/plans")
			return
		}

		// start the manual scan and clear progress if the request is rejected
		progress.startScan()
		try {
			const manualScanResult = await sendManualScan(topic.id)
			if (manualScanResult === "budget" || manualScanResult === "paused") {
				progress.stopScan()
				handleBlocked(manualScanResult === "budget" ? SCAN_SPENT_BUDGET_LABEL : MANUAL_SCAN_PAUSED_LABEL, "/account")
			}
		} catch (error) {
			progress.stopScan()
			throw error
		}
	}
	return (
		<View className="gap-2">
			{isRunning ? (
				<View className="flex-row items-center gap-2">
					<Text className="font-display text-link">Carl is Brewing…</Text>
					{progress.isScanning && (
						<Button
							variant="ghost"
							size="icon"
							accessibilityLabel="Stop this Brew"
							disabled={mutation.isPending || progress.isCancellingScan}
							onPress={() =>
								void mutation.run(async () => {
									// request cancellation and restore the control if it fails
									progress.cancelScan()
									try {
										await sendStopScan(topic.id)
									} catch (error) {
										progress.stopCancelling()
										throw error
									}
								})
							}
						>
							<Icon as={CirclePause} />
						</Button>
					)}
				</View>
			) : (
				<Button accessibilityLabel="Brew" disabled={mutation.isPending} onPress={() => void mutation.run(handleScan)}>
					<Icon as={Coffee} className="size-4" />
					<Text>Brew</Text>
				</Button>
			)}
			{mutation.error && <Text className="text-sm text-destructive">{mutation.error}</Text>}
		</View>
	)
}
