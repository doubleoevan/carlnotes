import type { AccountFieldElements, ProfileFieldElements } from "@carlnotes/core/components/AccountFields"
import type { BlockedUsersElements } from "@carlnotes/core/components/BlockedUsersSection"
import { cn } from "@carlnotes/nightshift/classNames"
import { Check, Info } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Label } from "@/components/primitives/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { CARD_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// keep the web's controls and layout around the shared account forms
export const ACCOUNT_FIELD_ELEMENTS: AccountFieldElements = {
	Card: ({ children }) => <section className={CARD_CLASS}>{children}</section>,
	Group: ({ children }) => <div className="mt-3 max-w-sm space-y-3">{children}</div>,
	Form: ({ children, onSubmit }) => (
		<form
			className="mt-3 max-w-sm space-y-3"
			onSubmit={(event) => {
				// submit the shared form without navigating
				event.preventDefault()
				onSubmit()
			}}
		>
			{children}
		</form>
	),
	Heading: ({ children }) => <h3 className="font-semibold">{children}</h3>,
	Text: ({ children, className }) => <p className={className}>{children}</p>,
	Field: ({ label, value, onChange, kind }) => (
		<div className="space-y-1.5">
			<Label htmlFor={label}>{label}</Label>
			<Input
				id={label}
				aria-label={label}
				className="bg-card"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				type={kind === "email" ? "email" : "password"}
				autoComplete={kind}
				required
			/>
		</div>
	),
	Button: ({ label, isDisabled }) => (
		<Button type="submit" disabled={isDisabled}>
			{label}
		</Button>
	),
	Choice: ({ label, description, isSelected, isDisabled, onSelect }) => (
		<label className="flex cursor-pointer items-center gap-2 text-sm">
			<input type="radio" name="who-may-invite" checked={isSelected} disabled={isDisabled} onChange={onSelect} />
			{label}
			{description && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Info className="text-primary stroke-card size-4.5 fill-current" aria-label="What counts as interacting" />
					</TooltipTrigger>
					<TooltipContent className="max-w-64">{description}</TooltipContent>
				</Tooltip>
			)}
		</label>
	),
}

// the blocked people section's rows around the shared account elements
export const BLOCKED_USERS_ELEMENTS: BlockedUsersElements = {
	Card: ACCOUNT_FIELD_ELEMENTS.Card,
	Group: ACCOUNT_FIELD_ELEMENTS.Group,
	Heading: ACCOUNT_FIELD_ELEMENTS.Heading,
	Text: ACCOUNT_FIELD_ELEMENTS.Text,
	Button: ({ label, onPress, isDisabled }) => (
		<Button type="button" variant="outline" size="sm" onClick={onPress} disabled={isDisabled}>
			{label}
		</Button>
	),
	Row: ({ children }) => <div className="flex items-center justify-between gap-3 text-sm">{children}</div>,
	Username: ({ userId, username }) => (
		<AnchorLink href={`/profiles/${userId}`} className="min-w-0 truncate font-semibold">
			{username}
		</AnchorLink>
	),
}

// preserve the web profile's row layout, form submission, and provider-photo toggle
export const PROFILE_FIELD_ELEMENTS: ProfileFieldElements = {
	Root: ({ children, className }) => <div className={className}>{children}</div>,
	Identity: ({ avatar, children }) => (
		<div className="flex items-center gap-4">
			{avatar}
			<div className="text-sm">{children}</div>
		</div>
	),
	Text: ACCOUNT_FIELD_ELEMENTS.Text,
	ProviderPhoto: ({ label, isSelected, onSelect }) => (
		<button type="button" onClick={onSelect} aria-pressed={isSelected} className={cn(STANDALONE_LINK_CLASS, "text-xs")}>
			{label}
			{isSelected && <Check className="ml-1 inline size-3.5" />}
		</button>
	),
	Form: ({ children, onSubmit, isExternallySaved }) => (
		<form
			className={cn("mt-3 space-y-3", !isExternallySaved && "max-w-sm")}
			onSubmit={(event) => {
				// submit the shared form without navigating
				event.preventDefault()
				onSubmit()
			}}
		>
			{children}
		</form>
	),
	Field: ({ label, value, onChange, placeholder, hasRejection }) => (
		<div className="space-y-1.5">
			<Label htmlFor="username">{label}</Label>
			<Input
				id="username"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				aria-describedby={hasRejection ? "username-rejection" : undefined}
				className="bg-card"
				required
			/>
		</div>
	),
	Rejection: ({ children }) => (
		<p id="username-rejection" className="text-destructive text-sm">
			{children}
		</p>
	),
	Button: ACCOUNT_FIELD_ELEMENTS.Button,
}
