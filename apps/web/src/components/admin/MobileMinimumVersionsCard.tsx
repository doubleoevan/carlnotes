// the admin console's mobile app section: each platform's minimum app version, who saved it and when, and the input
// that raises, lowers, or clears it

import { sendMobileMinimumVersion } from "@carlnotes/client/billingClient"
import type { MobileMinimumVersionRow } from "@carlnotes/contracts/admin"
import { parseAppVersion } from "@carlnotes/contracts/appVersions"
import type { MobilePlatform } from "@carlnotes/contracts/clientTelemetry"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"

// the display name of each mobile platform
const PLATFORM_LABELS: Record<MobilePlatform, string> = { ios: "iOS", android: "Android" }

type MobileMinimumVersionsCardProps = {
	minimumVersions: MobileMinimumVersionRow[]
	onSaved: () => void
}

/**
 * Renders one row per platform: the stored minimum with who saved it and when, or a line for none, and the version
 * input with Save. An empty input clears the minimum.
 */
export function MobileMinimumVersionsCard({ minimumVersions, onSaved }: MobileMinimumVersionsCardProps) {
	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-muted-foreground">
				A build older than a platform's minimum is told to update on its next request. Clear a minimum to serve every
				build again.
			</p>
			{/* one row per platform */}
			{(Object.keys(PLATFORM_LABELS) as MobilePlatform[]).map((platform) => (
				<MobileMinimumVersionRowForm
					key={platform}
					platform={platform}
					row={minimumVersions.find((minimumVersionRow) => minimumVersionRow.platform === platform) ?? null}
					onSaved={onSaved}
				/>
			))}
		</div>
	)
}

type MobileMinimumVersionRowFormProps = {
	platform: MobilePlatform
	row: MobileMinimumVersionRow | null
	onSaved: () => void
}

// one platform's row: its state line and the version input with Save
function MobileMinimumVersionRowForm({ platform, row, onSaved }: MobileMinimumVersionRowFormProps) {
	const [versionText, setVersionText] = useState(row?.minimumVersion ?? "")
	const [isSaving, setIsSaving] = useState(false)
	const platformLabel = PLATFORM_LABELS[platform]

	// save the typed version, or clear the minimum on an empty input, then reload the console
	async function handleSave(): Promise<void> {
		// a version that is not dotted integers is not sent
		const minimumVersion = versionText.trim() === "" ? null : versionText.trim()
		if (minimumVersion !== null && !parseAppVersion(minimumVersion)) {
			toast.error(`${platformLabel} minimum must be a version like 1.2.0.`)
			return
		}
		setIsSaving(true)
		try {
			await sendMobileMinimumVersion(platform, minimumVersion)
			onSaved()
		} catch (error) {
			console.error("mobile minimum version failed", error)
			toast.error(`${platformLabel} minimum didn't save.`)
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<div className="flex flex-col gap-1">
			{/* the platform and its stored state */}
			<p className="text-sm font-medium">{platformLabel}</p>
			<p className="text-sm text-muted-foreground">{toMinimumVersionStateLine(row)}</p>
			{/* the input and the save button */}
			<div className="flex items-center gap-2">
				<Input
					aria-label={`${platformLabel} minimum version`}
					className="max-w-40"
					placeholder="1.2.0"
					value={versionText}
					onChange={(event) => setVersionText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							void handleSave()
						}
					}}
				/>
				<Button variant="outline" size="sm" disabled={isSaving} onClick={() => void handleSave()}>
					Save
				</Button>
			</div>
		</div>
	)
}

// the stored minimum with who saved it and when, or the line for a platform with none
function toMinimumVersionStateLine(row: MobileMinimumVersionRow | null): string {
	if (!row) {
		return "No minimum. Every build is served."
	}
	const savedByUsername = row.updatedByUsername ?? "a closed account"
	return `Minimum ${row.minimumVersion}, saved by ${savedByUsername} on ${toDateLabel(row.updatedAt)}.`
}
