// the "@" menu inside a note comment. blocknote's comment box takes no extra children. the box
// is rebuilt here around the same nested editor with the menu added
import { BlockNoteView } from "@blocknote/mantine"
import {
	type ComponentProps,
	type DefaultReactSuggestionItem,
	FormattingToolbar,
	FormattingToolbarController,
	getFormattingToolbarItems,
	SuggestionMenuController,
	type SuggestionMenuProps,
	useBlockNoteContext,
	useBlockNoteEditor,
} from "@blocknote/react"
import { createContext, useContext } from "react"
import { MENU_OPTION_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// the usernames the menu offers, passed by context. the components contract has a fixed prop shape
const MentionUsernamesContext = createContext<string[]>([])
export const MentionUsernamesProvider = MentionUsernamesContext.Provider

/**
 * The comment box: mantine's own, plus the mention menu.
 * Inside this view useBlockNoteEditor resolves to the nested comment editor, so the menu types into the comment
 */
export function CommentEditorWithMentions(props: ComponentProps["Comments"]["Editor"]) {
	const context = useBlockNoteContext()
	return (
		<BlockNoteView
			editor={props.editor}
			editable={props.editable}
			autoFocus={props.autoFocus}
			className={props.className}
			onFocus={props.onFocus}
			onBlur={props.onBlur}
			theme={context?.colorSchemePreference === "dark" ? "dark" : "light"}
			sideMenu={false}
			slashMenu={false}
			tableHandles={false}
			filePanel={false}
			formattingToolbar={false}
		>
			<FormattingToolbarController formattingToolbar={CommentFormattingToolbar} />
			<UsernameMentionMenu />
		</BlockNoteView>
	)
}

// the comment box's own text controls, with the block nesting buttons filtered out
function CommentFormattingToolbar() {
	return (
		<FormattingToolbar blockTypeSelectItems={[]}>
			{getFormattingToolbarItems([]).filter(
				(item) => item.key !== "nestBlockButton" && item.key !== "unnestBlockButton",
			)}
		</FormattingToolbar>
	)
}

// typing "@" offers the note's team. the username mention is written as plain text
function UsernameMentionMenu() {
	const editor = useBlockNoteEditor()
	const usernames = useContext(MentionUsernamesContext)
	return (
		<SuggestionMenuController
			triggerCharacter="@"
			getItems={async (query) =>
				usernames
					.filter((username) => username.toLowerCase().includes(query.toLowerCase()))
					.map((username) => ({
						title: `@${username}`,
						// the controller has already removed the "@" and whatever was typed after it
						onItemClick: () => editor.insertInlineContent([`@${username} `]),
					}))
			}
			suggestionMenuComponent={UsernameMentionList}
		/>
	)
}

// the username mentions menu, with the app's popover and option styling
function UsernameMentionList(props: SuggestionMenuProps<DefaultReactSuggestionItem>) {
	if (props.items.length === 0) {
		return null
	}
	return (
		<div className="bg-popover text-popover-foreground z-50 w-52 rounded-md border p-1 shadow-lift">
			{props.items.map((item, index) => (
				<button
					key={item.title}
					type="button"
					onClick={() => props.onItemClick?.(item)}
					className={cn(MENU_OPTION_CLASS, index === props.selectedIndex && "bg-accent")}
				>
					{item.title}
				</button>
			))}
		</div>
	)
}
