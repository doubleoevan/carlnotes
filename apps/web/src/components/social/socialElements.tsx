// the web's elements for the shared reaction row and comment thread
import { toProfilePath } from "@carlnotes/contracts/seo"
import type { ReactionType } from "@carlnotes/contracts/social"
import type { TextComposerElementProps } from "@carlnotes/core/components/TextComposer"
import type { CommentElements, ComposerShareSwitchProps, SocialElements } from "@carlnotes/core/lib/socialElements"
import {
	CARL_AUTHOR_LABEL,
	COMMENT_THREAD_LABELS,
	toChapterLabel,
	toChapterOptions,
	toChapterPosition,
	toChapterValue,
} from "@carlnotes/core/lib/socialLabels"
import { cn } from "@carlnotes/nightshift/classNames"
import { ICON_ACTION_CLASS } from "@carlnotes/nightshift/iconAction"
import {
	Flag,
	Flame,
	Heart,
	HeartPlus,
	Laugh,
	Lightbulb,
	type LucideIcon,
	PartyPopper,
	Pencil,
	Reply,
	ThumbsUp,
	Trash2,
} from "lucide-react"
import { type ReactNode, useId } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { ShareMugsIcon } from "@/components/branding/ShareMugsIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { IconButton } from "@/components/common/IconButton"
import { ScrollBox } from "@/components/common/ScrollBox"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/primitives/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Switch } from "@/components/primitives/switch"
import { Textarea } from "@/components/primitives/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MoreButton } from "@/components/topic/MoreButton"
import {
	ACTIVE_ICON_CLASS,
	INFO_CARD_CLASS,
	LIGHT_ICON_FILL_CLASS,
	ROW_CONTROL_CLASS,
	ROW_CONTROLS_CLASS,
} from "@/lib/styleClasses"
import { ReactionUsersTooltip } from "./ReactionUsersTooltip"

// each reaction type's icon
const REACTION_ICONS: Record<ReactionType, LucideIcon> = {
	like: ThumbsUp,
	celebrate: PartyPopper,
	support: HeartPlus,
	love: Heart,
	insightful: Lightbulb,
	funny: Laugh,
}

// a disabled control's tooltip, its name, its look, and its icon
type DisabledControlProps = { tooltip: string; label: string; className: string; children: ReactNode }

// each row control's icon
const ROW_CONTROL_ICONS: Record<"edit" | "delete", LucideIcon> = { edit: Pencil, delete: Trash2 }

// the comment parts that the note thread and the comment thread share
export const COMMENT_ELEMENTS: CommentElements = {
	Message: ({ children }) => <p className="text-muted-foreground">{children}</p>,
	List: ({ children }) => <ul className="flex flex-col gap-3">{children}</ul>,
	Row: ({ children }) => <li className="flex flex-col gap-1">{children}</li>,
	Age: ({ children }) => <span className="text-muted-foreground shrink-0 text-xs">{children}</span>,
	Body: ({ isScrolling, children }) => {
		const body = <p className="whitespace-pre-wrap break-words">{children}</p>
		return isScrolling ? <ScrollBox className="max-h-40">{body}</ScrollBox> : body
	},
	Composer: SocialComposer,
}

// the web's elements. the composer opens in a dialog
export const SOCIAL_ELEMENTS: SocialElements = {
	...COMMENT_ELEMENTS,
	Container: ({ children }) => <div className={cn(INFO_CARD_CLASS, "flex flex-col gap-3 text-sm")}>{children}</div>,
	Loading: () => <CoffeeLoading className="min-h-0 justify-start py-2 text-sm" />,
	Header: ({ children }) => <div className="flex flex-wrap items-center gap-2">{children}</div>,
	Author: ({ author }) =>
		author ? (
			<UserProfileLink user={author} className="min-w-0 truncate font-semibold" />
		) : (
			<span className="truncate font-semibold">{CARL_AUTHOR_LABEL}</span>
		),
	Replies: ({ children }) => <ul className="border-border mt-2 ml-4 flex flex-col gap-3 border-l pl-3">{children}</ul>,
	ShareToggle: ({ label, isShared, isAired, isDisabled, onPress }) => {
		const shareToggleClass = cn(
			"grid h-8 shrink-0 place-items-center rounded-md",
			ICON_ACTION_CLASS,
			isShared ? "text-primary" : "text-muted-foreground hover:text-foreground",
			isDisabled && "opacity-50",
		)
		const shareIcon = isAired ? (
			<ShareMugsIcon />
		) : (
			<Flame className={cn("size-4", isShared && LIGHT_ICON_FILL_CLASS)} aria-hidden />
		)
		return isDisabled || !onPress ? (
			<DisabledControl tooltip={label} label={label} className={shareToggleClass}>
				{shareIcon}
			</DisabledControl>
		) : (
			<IconButton tooltip={label} className={shareToggleClass} onClick={onPress}>
				{shareIcon}
			</IconButton>
		)
	},
	Controls: ({ children }) => <div className={ROW_CONTROLS_CLASS}>{children}</div>,
	RowControl: ({ kind, label, disabledReason, onPress }) => {
		const Icon = ROW_CONTROL_ICONS[kind]
		return disabledReason ? (
			<DisabledControl tooltip={disabledReason} label={label} className={cn(ROW_CONTROL_CLASS, "disabled:opacity-50")}>
				<Icon className="size-4" />
			</DisabledControl>
		) : (
			<IconButton tooltip={label} className={ROW_CONTROL_CLASS} onClick={onPress}>
				<Icon className="size-4" />
			</IconButton>
		)
	},
	ReplyButton: ({ label, onPress }) => (
		<button
			type="button"
			onClick={onPress}
			className={cn(
				"text-muted-foreground hover:text-foreground inline-flex h-6 shrink-0 items-center gap-1 text-xs",
				ICON_ACTION_CLASS,
			)}
		>
			<Reply className="size-4" aria-hidden />
			{label}
		</button>
	),
	Report: ({ label, isReported, onPress }) => (
		<IconButton tooltip={label} className={ROW_CONTROL_CLASS} onClick={onPress}>
			<Flag className={cn("size-4", isReported && ACTIVE_ICON_CLASS)} />
		</IconButton>
	),
	More: ({ label, onPress }) => (
		<Button variant="link" size="sm" className="self-start" onClick={onPress}>
			{label}
		</Button>
	),
	MoreToggle: (props) => <MoreButton {...props} className="mt-2 sm:min-h-6" />,
	ComposerRow: ({ children }) => <div className="flex items-center justify-between gap-3">{children}</div>,
	SharedCommentSlotsLabel: ({ tooltip, children }) => (
		<Tooltip>
			<TooltipTrigger className="text-badge flex min-w-0 items-center gap-1.5 text-right font-semibold">
				<ShareMugsIcon />
				<span className="min-w-0">{children}</span>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	),
	ComposerButton: ({ label, onPress }) => (
		<Button size="sm" className="shrink-0" onClick={onPress}>
			{label}
		</Button>
	),
	Confirm: ConfirmDialog,
	ComposerFrame: ({ title, onClose, children }) => (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent aria-describedby={undefined} className="sm:max-w-md">
				<DialogTitle>{title}</DialogTitle>
				{children}
			</DialogContent>
		</Dialog>
	),
	ComposerShareSwitch: SocialComposerShareSwitch,
	ReactionGroup: ({ children }) => <div className={ROW_CONTROLS_CLASS}>{children}</div>,
	ReactionOption: ({ reactionType, label, count, users, moreUsersLabel, isOwn, isDisabled, onPress }) => {
		const Icon = REACTION_ICONS[reactionType]
		return (
			<IconButton
				tooltip={
					users.length > 0 ? (
						<ReactionUsersTooltip label={label} users={users} moreUsersLabel={moreUsersLabel} />
					) : (
						label
					)
				}
				ariaLabel={`${label}${count > 0 ? `, ${count}` : ""}${isOwn ? ", your reaction" : ""}`}
				isDisabled={isDisabled}
				className={cn(
					"hover:text-foreground inline-flex h-8 items-center gap-1 rounded-full text-xs",
					ICON_ACTION_CLASS,
					isOwn ? "text-primary font-semibold" : "text-muted-foreground",
				)}
				onClick={onPress}
			>
				<Icon className={cn("size-4", isOwn && LIGHT_ICON_FILL_CLASS)} aria-hidden />
				{count > 0 && <span>{count}</span>}
			</IconButton>
		)
	},
	Mention: ({ userId, children }) => (
		<AnchorLink href={toProfilePath(userId)} className="text-primary font-medium">
			{children}
		</AnchorLink>
	),
	ChapterTag: ({ chapter, onPress }) => (
		<button
			type="button"
			onClick={onPress}
			className="bg-muted text-muted-foreground hover:text-foreground max-w-full truncate rounded-full px-2 py-0.5 text-xs"
		>
			{toChapterLabel(chapter)}
		</button>
	),
	ChapterSelect: ({ chapters, chapterPosition, onChange }) => (
		<Select value={toChapterValue(chapterPosition)} onValueChange={(value) => onChange(toChapterPosition(value))}>
			<SelectTrigger aria-label={COMMENT_THREAD_LABELS.chapter} size="sm" className="w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{toChapterOptions(chapters).map(({ value, label }) => (
					<SelectItem key={value} value={value}>
						{label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
}

// the switch at the composer's bottom left
function SocialComposerShareSwitch({ label, isChecked, disabledReason, onChange }: ComposerShareSwitchProps) {
	const switchId = useId()
	const shareSwitch = (
		<div className="flex items-center gap-2">
			<Switch id={switchId} checked={isChecked} disabled={Boolean(disabledReason)} onCheckedChange={onChange} />
			<label htmlFor={switchId} className="text-muted-foreground text-sm">
				{label}
			</label>
		</div>
	)
	return disabledReason ? (
		<Tooltip>
			<TooltipTrigger asChild>{shareSwitch}</TooltipTrigger>
			<TooltipContent>{disabledReason}</TooltipContent>
		</Tooltip>
	) : (
		shareSwitch
	)
}

// a disabled control with a tooltip, on a span. a disabled button gets no hover or focus
function DisabledControl({ tooltip, label, className, children }: DisabledControlProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex" role="note" aria-label={tooltip}>
					<button type="button" aria-label={label} disabled className={className}>
						{children}
					</button>
				</span>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}

// the composer: the text box, the users a trailing mention suggests, Carl's words about a rejected text, and the
// submit, by the button or by command-enter
function SocialComposer({
	value,
	onChange,
	onSubmit,
	isPending,
	canSubmit,
	maxLength,
	placeholder,
	inputLabel = placeholder,
	submitLabel,
	isAutoFocused,
	message,
	suggestions = [],
	onPickSuggestion,
	footerStart,
}: TextComposerElementProps) {
	return (
		<form
			className="flex flex-col gap-2"
			onSubmit={(event) => {
				// post without navigating
				event.preventDefault()
				onSubmit()
			}}
		>
			<Textarea
				autoFocus={isAutoFocused}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						// post through the keyboard shortcut
						event.preventDefault()
						onSubmit()
					}
				}}
				placeholder={placeholder}
				aria-label={inputLabel}
				rows={2}
				maxLength={maxLength}
				className="bg-card"
			/>

			{/* the users the trailing mention suggests */}
			{suggestions.length > 0 && (
				<ul className="flex flex-wrap gap-1" aria-label={COMMENT_THREAD_LABELS.mentionSuggestions}>
					{suggestions.map((user) => (
						<li key={user.userId}>
							<Button type="button" variant="outline" size="sm" onClick={() => onPickSuggestion?.(user)}>
								{`@${user.username}`}
							</Button>
						</li>
					))}
				</ul>
			)}
			{message && (
				<p role="alert" className="text-destructive">
					{message}
				</p>
			)}
			<div className="flex items-center justify-between gap-2">
				{footerStart}
				<Button type="submit" size="sm" className="ml-auto" disabled={!canSubmit || isPending}>
					{submitLabel}
				</Button>
			</div>
		</form>
	)
}
