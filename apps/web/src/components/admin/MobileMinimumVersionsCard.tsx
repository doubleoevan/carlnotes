// the admin console's mobile app section: each platform's minimum app version, who saved it and when, and the input
// that raises, lowers, or clears it

import { sendMobileMinimumVersion } from "@carlnotes/client/billingClient"
import type { MobileMinimumVersionRow } from "@carlnotes/contracts/admin"
import { parseAppVersion } from "@carlnotes/contracts/appVersions"
import type { MobilePlatform } from "@carlnotes/contracts/clientTelemetry"
import type { ConfirmationCopy } from "@carlnotes/core/lib/confirmationCopy"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { useConfirmDialog } from "@/hooks/useConfirmDialog"
import { CARD_CLASS } from "@/lib/styleClasses"

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
		<section className={cn(CARD_CLASS, "flex flex-col gap-4")}>
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
		</section>
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
	const { confirm, confirmDialog } = useConfirmDialog()
	const platformLabel = PLATFORM_LABELS[platform]
	const minimumVersion = versionText.trim() === "" ? null : versionText.trim()

	// open the confirmation for an empty input or a version. a version that is not dotted integers is not sent
	function handleSubmit(): void {
		if (minimumVersion !== null && !parseAppVersion(minimumVersion)) {
			toast.error(`${platformLabel} minimum must be a version like 1.2.0.`)
			return
		}
		confirm(toMinimumVersionConfirmation(platformLabel, minimumVersion), handleSave)
	}

	// save the typed version, or clear the minimum on an empty input, then reload the console
	async function handleSave(): Promise<void> {
		try {
			await sendMobileMinimumVersion(platform, minimumVersion)
			onSaved()
		} catch (error) {
			console.error("mobile minimum version failed", error)
			toast.error(`${platformLabel} minimum didn't save.`)
		}
	}

	const inputId = `${platform}-minimum-version`
	return (
		<form
			className="space-y-1.5"
			onSubmit={(event) => {
				// confirm without navigating
				event.preventDefault()
				handleSubmit()
			}}
		>
			{/* the platform and its stored state */}
			<Label htmlFor={inputId}>{platformLabel}</Label>
			<p className="text-sm text-muted-foreground">{toMinimumVersionStateLine(row)}</p>
			{/* the input and the save button, held to a field's width as the account page's fields are */}
			<div className="flex max-w-lg items-center gap-2">
				<Input
					id={inputId}
					aria-label={`${platformLabel} minimum version`}
					className="bg-card"
					placeholder="1.2.0"
					value={versionText}
					onChange={(event) => setVersionText(event.target.value)}
				/>
				<Button type="submit" variant="outline" size="sm">
					Save
				</Button>
			</div>
			{confirmDialog}
		</form>
	)
}

// what setting a platform's minimum, or clearing it for no version, asks first
function toMinimumVersionConfirmation(platformLabel: string, minimumVersion: string | null): ConfirmationCopy {
	if (!minimumVersion) {
		return {
			title: `Clear the ${platformLabel} minimum?`,
			children: `Every ${platformLabel} build is served again.`,
			confirmLabel: "Clear minimum",
			cancelLabel: "Cancel",
		}
	}
	return {
		title: `Set the ${platformLabel} minimum to ${minimumVersion}?`,
		children: `${platformLabel} builds older than ${minimumVersion} are told to update on their next request.`,
		confirmLabel: "Set minimum",
		cancelLabel: "Cancel",
	}
}

// the stored minimum with who saved it and when, or the line for a platform with none
function toMinimumVersionStateLine(row: MobileMinimumVersionRow | null): string {
	if (!row) {
		return "No minimum. Every build is served."
	}
	const savedByUsername = row.updatedByUsername ?? "a closed account"
	return `Minimum ${row.minimumVersion}, saved by ${savedByUsername} on ${toDateLabel(row.updatedAt)}.`
}
