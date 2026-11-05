import {
	type PersonalSourcesImportDialogElements,
	type PersonalSourcesImportDialogProps,
	PersonalSourcesImportDialog as SharedPersonalSourcesImportDialog,
} from "@carlnotes/core/components/PersonalSourcesImportDialog"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Textarea } from "@/components/primitives/textarea"
import { usePersonalSourcesImport } from "@/hooks/usePersonalSourcesImport"

/**
 * Supplies browser file parsing and semantic fields to the shared import dialog.
 */
export function PersonalSourcesImportDialog(props: PersonalSourcesImportDialogProps) {
	// keep file access and the browser worker outside the shared composition
	const importer = usePersonalSourcesImport(props.topicId)
	return (
		<SharedPersonalSourcesImportDialog
			{...props}
			elements={ELEMENTS}
			importer={importer}
			renderFilePicker={() => (
				<Input
					type="file"
					accept=".json,.zip"
					aria-label="Conversation export, JSON or ZIP"
					onChange={(event) => {
						// release the selected file input after passing it to the local parser
						const file = event.target.files?.[0]
						if (file) {
							void importer.parseFile(file)
						}
						event.target.value = ""
					}}
				/>
			)}
		/>
	)
}

// DOM controls provide browser semantics; selection, content, and actions live in core
const ELEMENTS: PersonalSourcesImportDialogElements = {
	Group: ({ children, className }) => <div className={className}>{children}</div>,
	Text: ({ children, className }) => <p className={className}>{children}</p>,
	Status: ({ children, isError }) => (
		<p role={isError ? "alert" : "status"} className={isError ? "text-sm text-destructive" : undefined}>
			{children}
		</p>
	),
	Button: ({ label, isDisabled, onPress, variant = "outline" }) => (
		<Button variant={variant} disabled={isDisabled} onClick={onPress}>
			{label}
		</Button>
	),
	Dialog: ({ title, description, children, onClose, isCloseDisabled }) => (
		<Dialog
			open
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					onClose()
				}
			}}
		>
			<DialogContent
				className="ph-no-capture max-h-[85dvh] grid-cols-1 overflow-y-auto [overflow-wrap:anywhere] [&>*]:min-w-0 [&_button]:h-auto [&_button]:whitespace-normal sm:max-w-xl"
				data-private
				isCloseButtonDisabled={isCloseDisabled}
			>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
				{children}
			</DialogContent>
		</Dialog>
	),
	Field: ({ label, value, onChange, isMultiline, placeholder, maxLength }) =>
		isMultiline ? (
			<Textarea
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
			/>
		) : (
			<Input
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				maxLength={maxLength}
			/>
		),
	Choice: ({ children, label, isSelected, isDisabled, onSelect }) => (
		<label className="flex items-start gap-2 rounded border border-separator p-3">
			<input
				type="checkbox"
				aria-label={label}
				className="mt-1 size-4 accent-primary"
				checked={isSelected}
				disabled={isDisabled}
				onChange={onSelect}
			/>
			<div className="min-w-0 flex-1">{children}</div>
		</label>
	),
}
