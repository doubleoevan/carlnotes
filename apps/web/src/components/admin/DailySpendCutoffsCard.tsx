// the admin console's spend control section: the day's free-plan spend on a meter with a circle at each daily spend
// cutoff under a ring of the time left until the cutoffs reset and over the estimated monthly spend, a ring of the
// waiting first scans against the first scan dispatch limit, a ring of the past hour's signups against the signup
// alert, and the unverified signups switch. a divider sits between each. the cutoffs save together from their Save
// button, and every other setting saves on its own

import { sendSpendControlSettings } from "@carlnotes/client/billingClient"
import type { AdminDailySpendCutoffs, DailySpendCutoffKind } from "@carlnotes/contracts/admin"
import { toWholeDollarLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { type ReactNode, useRef, useState } from "react"
import { toast } from "sonner"
import { EstimatedMonthlySpend } from "@/components/admin/EstimatedMonthlySpend"
import { FreePlanSpendMeter } from "@/components/admin/FreePlanSpendMeter"
import {
	EMPTY_CUTOFF_DOLLAR_TEXTS,
	type SpendControlDraft,
	toDraftCutoffCents,
	toSpendControlDraft,
	toSpendControlSettingsPayload,
} from "@/components/admin/spendControlDraft"
import { MeterRing } from "@/components/common/MeterRing"
import { Label } from "@/components/primitives/label"
import { Switch } from "@/components/primitives/switch"
import { ADMIN_NUMBER_INPUT_CLASS, CARD_CLASS } from "@/lib/styleClasses"

// the label of each daily spend cutoff, its column in the cutoff times table, its slider's label, and what passing it
// stops
const CUTOFF_COPY: Record<
	DailySpendCutoffKind,
	{ label: string; columnLabel: string; sliderLabel: string; line: string }
> = {
	podcastEpisodes: {
		label: "Podcast episodes cutoff",
		columnLabel: "Podcast episodes after first skipped",
		sliderLabel: "Skip podcast episodes after first at",
		line: "Free users' podcast episodes after first are skipped.",
	},
	scheduledScans: {
		label: "Scheduled scans cutoff",
		columnLabel: "Scheduled scans stop",
		sliderLabel: "Stop scheduled scans at",
		line: "Free users' scheduled scans stop and first scans wait.",
	},
	chat: {
		label: "Chat cutoff",
		columnLabel: "Chat stops",
		sliderLabel: "Stop chat at",
		line: "Free users' chat with Carl pauses until midnight UTC.",
	},
}

type DailySpendCutoffsCardProps = {
	dailySpendCutoffs: AdminDailySpendCutoffs
	onSaved: () => void
}

/**
 * Renders the day's free-plan spend against the daily spend cutoffs, the waiting first scans, and the past hour's
 * signups, each meter over its settings. The cutoffs save from their Save button, every other setting saves when its
 * input loses focus, and an empty input clears it.
 */
export function DailySpendCutoffsCard({ dailySpendCutoffs, onSaved }: DailySpendCutoffsCardProps) {
	// the typed overrides, and the last saved draft, which a save compares against and builds on
	const [savedDraft, setSavedDraft] = useState(() => toSpendControlDraft(dailySpendCutoffs))
	const [draft, setDraft] = useState(savedDraft)

	// the saves run one after another, each built on the draft the save before it stored
	const savedDraftRef = useRef(savedDraft)
	const saveQueueRef = useRef(Promise.resolve())

	// whether a cutoff differs from its saved text, and whether every cutoff reads its default
	const isCutoffChanged = JSON.stringify(draft.cutoffDollarTexts) !== JSON.stringify(savedDraft.cutoffDollarTexts)
	const isEveryCutoffDefault = Object.values(draft.cutoffDollarTexts).every(
		(cutoffDollarText) => cutoffDollarText === "",
	)

	// each cutoff at its typed value, passed once the day's free-plan spend reaches it, with its copy
	const meterCutoffs = dailySpendCutoffs.cutoffs.map((cutoff) => {
		const draftCutoffCents = toDraftCutoffCents(cutoff, draft.cutoffDollarTexts[cutoff.kind])
		const isPassed = dailySpendCutoffs.freePlanSpendCents >= draftCutoffCents
		return { ...cutoff, ...CUTOFF_COPY[cutoff.kind], value: draftCutoffCents, isPassed }
	})

	// set one cutoff's typed text
	function handleCutoffTextChange(kind: DailySpendCutoffKind, text: string): void {
		setDraft((current) => ({ ...current, cutoffDollarTexts: { ...current.cutoffDollarTexts, [kind]: text } }))
	}

	// queue a save of only the given fields, so every other setting keeps its saved value
	function handleSave(changedFields: Partial<SpendControlDraft>): void {
		saveQueueRef.current = saveQueueRef.current.then(() => saveDraft({ ...savedDraftRef.current, ...changedFields }))
	}

	// send the draft if it changed, or stop on a value the api would reject, then reload the console
	async function saveDraft(nextDraft: SpendControlDraft): Promise<void> {
		if (JSON.stringify(nextDraft) === JSON.stringify(savedDraftRef.current)) {
			return
		}
		const payload = toSpendControlSettingsPayload(nextDraft)
		if (!payload) {
			toast.error(
				"Cutoffs must be $0.01 to $1,000,000, the first scan limit 0 to 10,000, and the signup alert 1 to 1,000,000.",
			)
			return
		}

		// save, keep the saved draft, then reload the console
		try {
			await sendSpendControlSettings(payload)
			savedDraftRef.current = nextDraft
			setSavedDraft(nextDraft)
			onSaved()
		} catch (error) {
			console.error("spend control settings failed", error)
			toast.error("Spend control settings didn't save.")
		}
	}

	// flip the switch and save it at once. allowing unverified signups to scan turns their first scan limit off
	function handleUnverifiedSignupScanChange(isAllowed: boolean): void {
		setDraft((current) => ({ ...current, isUnverifiedFirstScanLimitOn: !isAllowed }))
		handleSave({ isUnverifiedFirstScanLimitOn: !isAllowed })
	}

	return (
		<div className={cn(CARD_CLASS, "flex flex-col gap-6")}>
			{/* the day's free-plan spend with the reset clock, a circle at each cutoff, and each cutoff's input beside what
			    it stops */}
			<section>
				<FreePlanSpendMeter
					freePlanSpendCents={dailySpendCutoffs.freePlanSpendCents}
					cutoffs={meterCutoffs}
					renderCutoffInput={(cutoff) => (
						<SpendControlInput
							ariaLabel={CUTOFF_COPY[cutoff.kind].label}
							placeholder={toWholeDollarLabel(cutoff.defaultValue)}
							step={0.01}
							value={draft.cutoffDollarTexts[cutoff.kind]}
							onChange={(text) => handleCutoffTextChange(cutoff.kind, text)}
						/>
					)}
				/>
				<EstimatedMonthlySpend
					worstCaseMonthlySpend={dailySpendCutoffs.worstCaseMonthlySpend}
					cutoffs={meterCutoffs}
					isCutoffChanged={isCutoffChanged}
					isEveryCutoffDefault={isEveryCutoffDefault}
					onCutoffChange={(kind, dollars) => handleCutoffTextChange(kind, String(dollars))}
					onCutoffSave={() => handleSave({ cutoffDollarTexts: draft.cutoffDollarTexts })}
					onCutoffReset={() => setDraft((current) => ({ ...current, cutoffDollarTexts: savedDraft.cutoffDollarTexts }))}
					onCutoffDefaults={() => setDraft((current) => ({ ...current, cutoffDollarTexts: EMPTY_CUTOFF_DOLLAR_TEXTS }))}
				/>
			</section>
			{/* the waiting first scans against the first scan dispatch limit */}
			<section className={DIVIDED_SECTION_CLASS}>
				<CountMeter
					title="First scan limit"
					count={dailySpendCutoffs.waitingScanCount}
					limit={dailySpendCutoffs.firstScanDispatchLimit.value}
					limitLabel="per sweep"
				>
					<SpendControlField
						ariaLabel="First scan limit"
						unitLabel="first scans each sweep can start"
						placeholder={String(dailySpendCutoffs.firstScanDispatchLimit.defaultValue)}
						step={1}
						value={draft.dispatchLimitText}
						onChange={(text) => setDraft((current) => ({ ...current, dispatchLimitText: text }))}
						onBlur={() => handleSave({ dispatchLimitText: draft.dispatchLimitText })}
					/>
				</CountMeter>
			</section>
			{/* the past hour's signups against the signup alert */}
			<section className={DIVIDED_SECTION_CLASS}>
				<CountMeter
					title="Hourly signup alert"
					count={dailySpendCutoffs.hourlySignupCount}
					limit={dailySpendCutoffs.hourlySignupAlertCount.value}
					limitLabel="before an alert"
				>
					<SpendControlField
						ariaLabel="Hourly signup alert"
						unitLabel="signups per hour"
						placeholder={String(dailySpendCutoffs.hourlySignupAlertCount.defaultValue)}
						step={1}
						value={draft.signupAlertText}
						onChange={(text) => setDraft((current) => ({ ...current, signupAlertText: text }))}
						onBlur={() => handleSave({ signupAlertText: draft.signupAlertText })}
					/>
				</CountMeter>
			</section>
			{/* the unverified signups switch, on while their first scans skip the first scan limit */}
			<div className={cn(DIVIDED_SECTION_CLASS, "flex items-center gap-3")}>
				<Switch
					id="unverified-signup-scans"
					checked={!draft.isUnverifiedFirstScanLimitOn}
					onCheckedChange={handleUnverifiedSignupScanChange}
				/>
				<Label htmlFor="unverified-signup-scans">Allow unverified email sign-ups to scan</Label>
			</div>
		</div>
	)
}

// a section after the first, with a divider above it
const DIVIDED_SECTION_CLASS = "border-t pt-6"

type CountMeterProps = {
	title: string
	count: number
	limit: number
	// what the limit counts, under the numbers inside the ring
	limitLabel: string
	// the limit's setting under the title
	children: ReactNode
}

// a count against its limit on a ring at the left that closes at the limit, with its title over its setting beside the
// ring, vertically centered
function CountMeter({ title, count, limit, limitLabel, children }: CountMeterProps) {
	// a limit of zero closes the ring once anything counts
	const countShare = limit > 0 ? count / limit : Math.min(1, count)
	return (
		<div className="flex items-center gap-6">
			<MeterRing
				share={countShare}
				centerText={`${count} of ${limit}`}
				centerSubtext={limitLabel}
				ariaLabel={`${count} of ${limit} ${limitLabel}`}
			/>
			<div className="flex min-w-0 flex-col items-start gap-3">
				<h3 className="font-semibold">{title}</h3>
				{children}
			</div>
		</div>
	)
}

type SpendControlInputProps = {
	// the input's accessible name
	ariaLabel: string
	placeholder: string
	step: number
	value: string
	onChange: (text: string) => void
	// the save of a setting that saves on its own
	onBlur?: () => void
}

// a small numeric input that shows an override as its text and the default as its placeholder
function SpendControlInput({ ariaLabel, placeholder, step, value, onChange, onBlur }: SpendControlInputProps) {
	return (
		<input
			aria-label={ariaLabel}
			type="number"
			min={0}
			step={step}
			placeholder={placeholder}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			onBlur={onBlur}
			className={ADMIN_NUMBER_INPUT_CLASS}
		/>
	)
}

type SpendControlFieldProps = SpendControlInputProps & {
	// what the setting counts, after the input
	unitLabel: string
}

// one numeric setting as a small input with what it counts after it
function SpendControlField({ unitLabel, ...inputProps }: SpendControlFieldProps) {
	return (
		<div className="flex items-center gap-2">
			<SpendControlInput {...inputProps} />
			<span className="text-muted-foreground text-sm">{unitLabel}</span>
		</div>
	)
}
