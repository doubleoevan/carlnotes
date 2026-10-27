import * as Sentry from "@sentry/react-native"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { visitAnalytics } from "@/visitAnalytics"

// a development-only, explicit delivery check against the build's configured projects
const meta = {
	title: "Common/TelemetryCheck",
	component: TelemetryCheck,
	parameters: { webReference: "Native SDK delivery check. Server events use the same analytics contracts." },
} satisfies Meta<typeof TelemetryCheck>
export default meta
type Story = StoryObj<typeof meta>
export const Delivery: Story = {}

function TelemetryCheck() {
	// show each SDK's result without printing configuration or account data
	const navigationCount =
		Sentry.getIsolationScope()
			.getScopeData()
			.breadcrumbs?.filter(({ category }) => /navigation|expo-router/.test(category ?? "")).length ?? 0
	const [status, setStatus] = useState("Ready to send a labeled test event to each configured service.")
	const [isPending, setIsPending] = useState(false)
	const handleSend = async (): Promise<void> => {
		setIsPending(true)
		try {
			if (!visitAnalytics || !Sentry.getClient()) {
				throw new Error("A telemetry service is not configured.")
			}
			// send an anonymous analytics event and a handled, labeled exception
			visitAnalytics.capture("telemetry_check", { check: "mobile-parity", $process_person_profile: false })
			Sentry.withScope((scope) => {
				scope.setTag("telemetryCheck", "mobile-parity")
				Sentry.captureException(new Error("CarlNotes mobile telemetry delivery check"))
			})
			await visitAnalytics.flush()
			const sentryFlushed = await Sentry.flush()
			setStatus(
				`PostHog flushed. Sentry ${sentryFlushed ? "flushed" : "flush timed out"}. Dashboard confirmation is separate.`,
			)
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Telemetry delivery failed.")
		} finally {
			setIsPending(false)
		}
	}
	return (
		<View className="gap-4 p-4">
			<Text>{status}</Text>
			<Text>Navigation breadcrumbs: {navigationCount}</Text>
			<Button accessibilityLabel="Send telemetry check" disabled={isPending} onPress={() => void handleSend()}>
				<Text>{isPending ? "Sending…" : "Send telemetry check"}</Text>
			</Button>
		</View>
	)
}
