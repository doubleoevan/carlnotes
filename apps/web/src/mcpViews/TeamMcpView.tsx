import type { ChatRoomMessagePage } from "@carlnotes/contracts/chat"
import type { McpViewTeam } from "@carlnotes/contracts/mcpViews"
import type { NotesResponse } from "@carlnotes/contracts/notes"
import { toTeamPath } from "@carlnotes/contracts/seo"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import {
	type ChatRoomMessageBubbleProps,
	type ChatRoomMessageElements,
	ChatRoomMessageBubble as SharedChatRoomMessageBubble,
} from "@carlnotes/core/components/ChatRoomMessageBubble"
import { type ChatRoomListBubbleProps, ChatRoomMessageList } from "@carlnotes/core/components/ChatRoomMessageList"
import { TeamHeader } from "@carlnotes/core/components/TeamHeader"
import { TeamSections, type TeamSectionsElements } from "@carlnotes/core/components/TeamSections"
import { TopicsTable } from "@carlnotes/core/components/TopicsTable"
import { TEAM_PAGE_SECTION_VALUES, TEAM_TOPICS_TOOLTIP } from "@carlnotes/core/lib/cardSections"
import { cn } from "@carlnotes/nightshift/classNames"
import { Paperclip } from "lucide-react"
import { useState } from "react"
import { TeamAvatar } from "@/components/branding/TeamAvatar"
import { CopyButton, toTimeAgoLabel } from "@/components/chat/ChatMessageParts"
import { CHAT_ROOM_MESSAGE_ELEMENTS } from "@/components/chat/ChatRoomMessageBubble"
import {
	CHAT_ROOM_MESSAGE_LIST_ELEMENTS,
	scrollToPlainListChatMessage,
} from "@/components/chat/chatRoomMessageListElements"
import { AccordionSection } from "@/components/common/AccordionSection"
import { NotesList } from "@/components/note/NotesList"
import { NotesSectionItem } from "@/components/note/NotesSectionItem"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { TableCard } from "@/components/table/TableCard"
import { TeamMembersTable } from "@/components/table/TeamMembersTable"
import { TEAM_HEADER_ELEMENTS } from "@/components/team/TeamHeader"
import { TEAM_SECTIONS_ELEMENTS } from "@/components/team/TeamSections"
import { PAGE_AVATAR_CLASS } from "@/lib/pageHeaderClasses"
import { MCP_VIEW_TOPICS_TABLE_ELEMENTS, McpViewSiteLink } from "./mcpViewElements"
import {
	callMcpViewTool,
	openMcpViewLink,
	PAGE_FAILED_TEXT,
	toMcpViewData,
	toMcpViewSiteUrl,
	useMcpViewData,
} from "./mcpViewHost"
import { MCP_VIEW_PAGE_CARD_ELEMENTS } from "./mcpViewPageCardElements"

// the tool that reads a team page, which the room's Load earlier messages button calls with its cursor
const READ_TEAM_TOOL = "read_team"

/**
 * The team MCP view: the team page's header, its card sections, members, topics, and notes in the page's accordion,
 * and for a member the room's newest messages with a Load earlier messages button that reads the older ones through
 * the tool. The MCP view only reads. A table changes nothing, a note and the invitation to write one open the team
 * page on the site, and the room sends nothing.
 */
export function TeamMcpView({ mcpViewTeam }: { mcpViewTeam: McpViewTeam }) {
	const { teamPage, notesResponse, chatMessagePage } = mcpViewTeam
	return (
		<div>
			<header>
				<TeamHeader
					teamPage={teamPage}
					noteCount={notesResponse?.notes.length ?? null}
					avatar={<TeamAvatar team={teamPage} className={PAGE_AVATAR_CLASS} />}
					elements={TEAM_HEADER_ELEMENTS}
				/>
			</header>
			{/* every section open by default, as on the team page, with the room last */}
			<div className="mt-2">
				<Accordion type="multiple" defaultValue={[...TEAM_PAGE_SECTION_VALUES, "room"]}>
					<TeamSections
						teamPage={teamPage}
						membersTable={
							<TableCard className="mb-2">
								<TeamMembersTable
									teamId={teamPage.teamId}
									members={teamPage.members}
									hiddenMemberCount={teamPage.hiddenMemberCount}
									isTeamLeader={false}
									isReadOnly
									onChanged={ignoreChange}
								/>
							</TableCard>
						}
						topicsTable={
							<TopicsTable
								topics={teamPage.topics}
								includesNonPublicTopics={Boolean(teamPage.role)}
								topicTooltip={TEAM_TOPICS_TOOLTIP}
								elements={MCP_VIEW_TOPICS_TABLE_ELEMENTS}
							/>
						}
						notesSection={notesResponse && <McpViewTeamNotes teamPage={teamPage} notesResponse={notesResponse} />}
						elements={MCP_VIEW_TEAM_SECTIONS_ELEMENTS}
					/>
					{chatMessagePage && <McpViewTeamRoom teamPage={teamPage} chatMessagePage={chatMessagePage} />}
				</Accordion>
			</div>
			<McpViewSiteLink href={toTeamPath(teamPage.teamId)}>Open on CarlNotes</McpViewSiteLink>
		</div>
	)
}

// the team notes as the team page's notes item, with no Add Note button and no dialog. a note opens the team page
function McpViewTeamNotes({ teamPage, notesResponse }: { teamPage: TeamPageResponse; notesResponse: NotesResponse }) {
	const handleOpenTeamPage = (): void => void openMcpViewLink(toMcpViewSiteUrl(toTeamPath(teamPage.teamId)))
	return (
		<NotesSectionItem
			pageType="team"
			noteCount={notesResponse.notes.length}
			titleClassName="font-display text-xl"
			hasCompactHeader={false}
			actions={null}
		>
			<NotesList
				notesResponse={notesResponse}
				pageType="team"
				signUpHref={null}
				onOpenNote={handleOpenTeamPage}
				onCreate={handleOpenTeamPage}
			/>
		</NotesSectionItem>
	)
}

// a member's room: the newest messages oldest first, and above them a Load earlier messages button that calls the
// tool with the oldest message's id as its cursor and puts the page it returns on top
function McpViewTeamRoom({
	teamPage,
	chatMessagePage,
}: {
	teamPage: TeamPageResponse
	chatMessagePage: ChatRoomMessagePage
}) {
	const { session } = useMcpViewData()

	// the messages the MCP view holds, whether older ones remain, and the load's state
	const [chatMessages, setChatMessages] = useState(chatMessagePage.chatMessages)
	const [hasEarlierChatMessages, setHasEarlierChatMessages] = useState(chatMessagePage.hasEarlierChatMessages)
	const [isLoadingEarlierChatMessages, setIsLoadingEarlierChatMessages] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)

	// read the page above the oldest message through the tool, and show the failure line if it returns none
	const handleLoadEarlierChatMessages = async (): Promise<void> => {
		const oldestChatMessage = chatMessages[0]
		if (!oldestChatMessage) {
			return
		}
		setIsLoadingEarlierChatMessages(true)
		setLoadError(null)
		try {
			const toolResult = await callMcpViewTool(READ_TEAM_TOOL, {
				team_id: teamPage.teamId,
				cursor: String(oldestChatMessage.id),
			})
			const earlierChatMessagePage = toolResult.isError ? null : toMcpViewData(toolResult._meta).team?.chatMessagePage
			if (!earlierChatMessagePage) {
				setLoadError(PAGE_FAILED_TEXT)
				return
			}
			setChatMessages((currentChatMessages) => [...earlierChatMessagePage.chatMessages, ...currentChatMessages])
			setHasEarlierChatMessages(earlierChatMessagePage.hasEarlierChatMessages)
		} catch {
			setLoadError(PAGE_FAILED_TEXT)
		} finally {
			setIsLoadingEarlierChatMessages(false)
		}
	}

	// one read-only bubble, whose quote scrolls to the message it answers
	const renderChatMessage = (bubbleProps: ChatRoomListBubbleProps) => (
		<SharedChatRoomMessageBubble
			{...bubbleProps}
			topicId={null}
			teamId={teamPage.teamId}
			voiceChatPage={null}
			isLinkPreviewLoading={false}
			onReply={ignoreChange}
			onQuoteClick={scrollToPlainListChatMessage}
			onAttachmentDelete={ignoreChange}
			onDeleteChatMessage={ignoreChange}
			elements={MCP_VIEW_CHAT_ROOM_MESSAGE_ELEMENTS}
		/>
	)
	return (
		<AccordionSection value="room" title="Team chat">
			<div className="space-y-4 py-3 wrap-anywhere">
				{hasEarlierChatMessages && (
					<div className="flex justify-center">
						<Button
							variant="outline"
							size="sm"
							disabled={isLoadingEarlierChatMessages}
							onClick={() => void handleLoadEarlierChatMessages()}
						>
							Load earlier messages
						</Button>
					</div>
				)}
				{loadError && (
					<p role="alert" className="text-muted-foreground text-center text-sm">
						{loadError}
					</p>
				)}
				<ChatRoomMessageList
					chatMessages={chatMessages}
					userId={session?.userId ?? null}
					canModerate={false}
					chatName={teamPage.name}
					isMessageLoading={false}
					renderChatMessage={renderChatMessage}
					elements={CHAT_ROOM_MESSAGE_LIST_ELEMENTS}
				/>
			</div>
		</AccordionSection>
	)
}

// a shared file's name, with no download and no delete
function McpViewRoomAttachments({ chatMessage }: ChatRoomMessageBubbleProps) {
	return (
		<>
			{chatMessage.attachments.map((attachment) => (
				<p key={attachment.id} className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
					<Paperclip className="size-3" />
					<span className="max-w-56 truncate">{attachment.name}</span>
				</p>
			))}
		</>
	)
}

// the footer's copy button and time, with no reply, delete, report, or play
function McpViewRoomFooter({ chatMessage, isOwnChatMessage, now }: ChatRoomMessageBubbleProps & { isModel: boolean }) {
	return (
		<div
			className={cn(
				"text-muted-foreground mt-1 flex items-center gap-2 text-xs",
				isOwnChatMessage && "flex-row-reverse",
			)}
		>
			<CopyButton text={chatMessage.content} isTooltipBelow={isOwnChatMessage} />
			<span>{toTimeAgoLabel(new Date(chatMessage.createdAt).getTime(), now)}</span>
		</div>
	)
}

// the web's room-message elements, with the read-only files and footer
const MCP_VIEW_CHAT_ROOM_MESSAGE_ELEMENTS: ChatRoomMessageElements = {
	...CHAT_ROOM_MESSAGE_ELEMENTS,
	Attachments: McpViewRoomAttachments,
	Footer: McpViewRoomFooter,
}

// do nothing on a table change or a room action
function ignoreChange(): void {}

// the web's sections with the MCP view's cards
const MCP_VIEW_TEAM_SECTIONS_ELEMENTS: TeamSectionsElements = {
	...TEAM_SECTIONS_ELEMENTS,
	...MCP_VIEW_PAGE_CARD_ELEMENTS,
}
