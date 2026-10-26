import { FIRST_SCAN_PAUSED_REASON, isBudgetError, toScanFailureLabel } from "@carlnotes/contracts/scanFailure"
import type { ComponentType, ReactNode } from "react"

// platform elements adapt inline account links and the upgrade button
type Container = ComponentType<{ children: ReactNode }>
export type TopicScanFailureComponents = {
	Message: ComponentType<{ isPaused: boolean; children: ReactNode }>
	Budget: Container
	UpgradeLine: Container
	Text: Container
	Link: ComponentType<{ href: string; isButton: boolean; children: ReactNode }>
}

/**
 * Renders the shared scan failure copy and its account or upgrade action.
 */
export function TopicScanFailure({
	error,
	components: { Message, Budget, UpgradeLine, Link, Text },
}: {
	error: string | null
	components: TopicScanFailureComponents
}) {
	// a planned pause points to the account meter
	const failureLabel = toScanFailureLabel(error)
	if (error === FIRST_SCAN_PAUSED_REASON) {
		return (
			<Message isPaused>
				{failureLabel}{" "}
				<Link href="/account" isButton={false}>
					See account
				</Link>
			</Message>
		)
	}
	if (!isBudgetError(error)) {
		return <Message isPaused={false}>{failureLabel}</Message>
	}
	return (
		<Budget>
			<Message isPaused={false}>{failureLabel}</Message>
			<UpgradeLine>
				<Link href="/plans" isButton>
					Upgrade
				</Link>
				<Text>{" to keep the pot brewing"}</Text>
			</UpgradeLine>
		</Budget>
	)
}
