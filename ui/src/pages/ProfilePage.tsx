import type { ProfileResponse, ProfileTopic, TopicResponse } from "@shared/contracts"
import { Flag } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FlagContentDialog } from "@/components/common/FlagContentDialog"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverCloseButton, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { SMALLEST_PAGE_SIZE, TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { TopicVisibility } from "@/components/table/TopicsTable"
import { EditTopicModal } from "@/components/topic/EditTopicModal"
import { TopicInfo } from "@/components/topic/TopicInfo"
import { authClient } from "@/lib/authClient"
import { fetchProfile } from "@/lib/profileClient"
import { fetchTopicPage } from "@/lib/topicClient"
import { cn, TABLE_CARD_CLASS, toMonthYearLabel } from "@/lib/utils"

/**
 * A user's public profile: their avatar, username, subscriber count, when they joined, and their public Topics,
 * with the owner's non-public topics only shown to the owner or an admin.
 */
export function ProfilePage() {
	const { userId } = useParams<{ userId: string }>()
	const navigate = useNavigate()
	const { data: session } = authClient.useSession()
	const [profile, setProfile] = useState<ProfileResponse | null>(null)
	const [isMissing, setMissing] = useState(false)
	const [isNewTopicOpen, setIsNewTopicOpen] = useState(false)

	// load the profile
	useEffect(() => {
		if (!userId) {
			return
		}
		// a failed load lands on the missing page rather than a spinner that never resolves
		fetchProfile(userId)
			.then((loaded) => (loaded ? setProfile(loaded) : setMissing(true)))
			.catch((error) => {
				console.error("profile load failed", error)
				setMissing(true)
			})
	}, [userId])

	// close the add topic modal and forward to the topic page
	const handleTopicCreated = async (topicId: string): Promise<void> => {
		setIsNewTopicOpen(false)
		navigate(`/topics/${topicId}`)
	}

	if (isMissing) {
		return <main className="mx-auto max-w-4xl px-safe py-10">No one here by that name.</main>
	}
	if (!profile) {
		return <CoffeeLoading />
	}

	return (
		<main className="mx-auto max-w-4xl px-safe py-10">
			<ProfileHeader profile={profile} />
			{/* a topic can be created from the profile page */}
			<TopicTable
				topics={profile.topics}
				isOwnProfile={session?.user.id === profile.userId}
				includesNonPublicTopics={profile.includesNonPublicTopics}
				onNewTopic={session?.user.id === profile.userId ? () => setIsNewTopicOpen(true) : undefined}
			/>
			{isNewTopicOpen && <EditTopicModal onClose={() => setIsNewTopicOpen(false)} onTopicSaved={handleTopicCreated} />}
		</main>
	)
}

// the avatar, the username, when they joined, and how many people subscribe to their topics
function ProfileHeader({ profile }: { profile: ProfileResponse }) {
	const { data: session } = authClient.useSession()
	// the month and year, not the day. less precision to protect a user's privacy
	const joinedMonth = new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })

	// a stranger's avatar isn't linked. your own avatar links to your account page.
	const isOwnProfile = session?.user.id === profile.userId
	const identity = (
		<>
			<UserAvatar
				userId={profile.userId}
				username={profile.username}
				avatarSource={profile.avatarSource}
				className="size-16"
			/>
			<h1 className="font-display text-2xl">{profile.username}</h1>
		</>
	)

	return (
		<header>
			<div className="flex items-center gap-4">
				{isOwnProfile ? (
					<AnchorLink href="/account" className="flex items-center gap-4 rounded-md hover:underline">
						{identity}
					</AnchorLink>
				) : (
					identity
				)}
				<ReportProfile profile={profile} />
			</div>
			{/* the number of unique people subscribed to this user's topic. different from the total number of subscriptions in the table */}
			<p className="text-muted-foreground mt-2 text-sm">
				Joined {joinedMonth} · {profile.subscriberCount.toLocaleString()} followers
			</p>
		</header>
	)
}

// the report button on a profile for a user to flag content
function ReportProfile({ profile }: { profile: ProfileResponse }) {
	const [isFlagging, setIsFlagging] = useState(false)
	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => setIsFlagging(true)}
						aria-label={`Report ${profile.username}`}
						className="text-muted-foreground hover:text-foreground ml-auto rounded-md p-2"
					>
						<Flag className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent>Report this profile</TooltipContent>
			</Tooltip>
			{isFlagging && (
				<FlagContentDialog
					subjectKind="profile"
					subjectId={profile.userId}
					subjectLabel={profile.username}
					onClose={() => setIsFlagging(false)}
				/>
			)}
		</>
	)
}

// the sort accessors for the profile table's columns
const profileTopicSortValues = {
	topic: (topic: ProfileTopic) => topic.name,
	created: (topic: ProfileTopic) => topic.createdAt,
	updated: (topic: ProfileTopic) => topic.updatedAt,
	// "kept" divided by "seen" sorts the ratio
	kept: (topic: ProfileTopic) => (topic.seenCount > 0 ? topic.keptCount / topic.seenCount : 0),
	subscribers: (topic: ProfileTopic) => topic.subscriberCount,
	visibility: (topic: ProfileTopic) => topic.visibility,
}

// what the topic column's tooltip says, since the table holds a different set for a visitor than for the owner or an admin
function toTopicColumnTooltip(isOwnProfile: boolean, includesNonPublicTopics: boolean): string {
	if (isOwnProfile) {
		return "Your topics"
	}
	return includesNonPublicTopics ? "All topics" : "Public topics"
}

// the profile owner's topics, only public topics shown for others and all topics shown for the owner or an admin
// non-public topic rows have a muted background
function TopicTable({
	topics,
	isOwnProfile,
	includesNonPublicTopics,
	onNewTopic,
}: {
	topics: ProfileTopic[]
	isOwnProfile: boolean
	includesNonPublicTopics: boolean
	onNewTopic?: () => void
}) {
	// the sorted column applies across all the tables pages
	const { pageRows, sort, pagination } = usePaginatedRowSort(topics, profileTopicSortValues)

	// the totals cover every past topic scan and of its current subscribers
	const totals = {
		kept: topics.reduce((sum, topic) => sum + topic.keptCount, 0),
		seen: topics.reduce((sum, topic) => sum + topic.seenCount, 0),
		subscribers: topics.reduce((sum, topic) => sum + topic.subscriberCount, 0),
		public: topics.filter((topic) => topic.visibility === "public").length,
	}

	// only the profile's owner can create a topic from their profile page.
	if (topics.length === 0) {
		return (
			<div className={cn(TABLE_CARD_CLASS, "mt-8 flex flex-wrap items-center justify-between gap-4")}>
				{onNewTopic ? (
					<>
						<p className="font-display text-lg">Give Carl a topic. You know the one.</p>
						<Button onClick={onNewTopic} className="shrink-0">
							New Topic
						</Button>
					</>
				) : (
					// an admin sees every topic, so an empty table means the user has none at all
					<p className="font-display text-lg">{includesNonPublicTopics ? "No topics yet." : "No public topics yet."}</p>
				)}
			</div>
		)
	}

	return (
		<div className={cn(TABLE_CARD_CLASS, "mt-8")}>
			<table className="w-full text-sm">
				<thead className="text-muted-foreground border-b">
					<tr>
						<SortableHeader
							sort={sort}
							sortKey="topic"
							label="Topic"
							tooltip={toTopicColumnTooltip(isOwnProfile, includesNonPublicTopics)}
							className="py-2 pr-4 text-left"
						/>
						<SortableHeader sort={sort} sortKey="created" label="Created" className="py-2 pr-4 text-left" />
						<SortableHeader sort={sort} sortKey="updated" label="Updated" className="py-2 pr-4 text-left" />
						{/* only the owner and an admin see the visibility column, since a visitor's rows are all public */}
						{includesNonPublicTopics && (
							<SortableHeader
								sort={sort}
								sortKey="visibility"
								label="Visibility"
								tooltip="Who may see this topic"
								className="py-2 pr-4 text-left"
							/>
						)}
						<SortableHeader
							sort={sort}
							sortKey="subscribers"
							label="Followers"
							tooltip="Topic followers"
							className="py-2 pr-4 text-left"
						/>
						<SortableHeader
							sort={sort}
							sortKey="kept"
							label="Kept / reviewed"
							tooltip="Carl reviewed and kept these findings"
							className="py-2 text-left"
						/>
					</tr>
				</thead>
				<tbody className="divide-separator divide-y divide-dashed">
					{pageRows.map((topic) => (
						// the owner's non-public rows sit on a tint, since a visitor never sees those topics here
						<tr key={topic.id} className={topic.visibility !== "public" ? "bg-muted/40" : undefined}>
							<td className="py-2 pr-4">
								<AnchorLink href={`/topics/${topic.id}`} className="text-link hover:underline">
									{topic.name}
								</AnchorLink>
							</td>
							<td className="text-muted-foreground py-2 pr-4">{toMonthYearLabel(topic.createdAt)}</td>
							<td className="text-muted-foreground py-2 pr-4">{toMonthYearLabel(topic.updatedAt)}</td>
							{/* only the owner and an admin have the visibility column to fill */}
							{includesNonPublicTopics && (
								<td className="py-2 pr-4">
									<TopicVisibility visibility={topic.visibility} />
								</td>
							)}
							<td className="py-2 pr-4">{topic.subscriberCount.toLocaleString()}</td>
							<td className="py-2">
								<TopicPopover topic={topic} />
							</td>
						</tr>
					))}
				</tbody>
				{/* the footer sums the columns, so a user who adds them up gets this number */}
				<tfoot className="border-t font-semibold">
					<tr>
						<td className="py-2 pr-4">Total</td>
						<td className="py-2 pr-4" colSpan={2} />
						{includesNonPublicTopics && <td className="py-2 pr-4">{`${totals.public}/${topics.length} public`}</td>}
						<td className="py-2 pr-4">
							{`${totals.subscribers.toLocaleString()} follower${totals.subscribers === 1 ? "" : "s"}`}
						</td>
						<td className="py-2">
							{totals.kept.toLocaleString()} / {totals.seen.toLocaleString()} findings
						</td>
					</tr>
				</tfoot>
			</table>
			{/* pagination only earns its space once there is more than one page at the smallest size */}
			{topics.length > SMALLEST_PAGE_SIZE && <TablePagination {...pagination} />}
		</div>
	)
}

/**
 * The kept-over-seen cell, which opens that Topic's info popup instead of navigating away.
 * The topic info is fetched when the popover opens.
 */
function TopicPopover({ topic }: { topic: ProfileTopic }) {
	const [topicInfo, setTopicInfo] = useState<TopicResponse | null>(null)

	// only fetch the topic info when the popover is first opened. cache it in state afterword.
	// a failed fetch leaves the state empty, so reopening the popover retries it
	function handleOpenChange(isOpen: boolean): void {
		if (isOpen && !topicInfo) {
			// a gated topic has no payload to show in the popover, which leaves it empty the same way a failure does
			fetchTopicPage(topic.id)
				.then((result) => setTopicInfo(result.status === "visible" ? result.topic : null))
				.catch((error) => console.error("topic info load failed", error))
		}
	}

	return (
		<Popover onOpenChange={handleOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger
						aria-label={`Topic roast for ${topic.name}`}
						className="text-link inline-flex items-center gap-1.5 hover:underline"
					>
						{topic.keptCount.toLocaleString()} / {topic.seenCount.toLocaleString()}
						<NoteIcon className="size-5" />
					</PopoverTrigger>
				</TooltipTrigger>
				{/* the cell reads kept-first to match its heading, so the tooltip spells both out in words */}
				<TooltipContent>
					Kept {topic.keptCount.toLocaleString()} out of {topic.seenCount.toLocaleString()} findings
				</TooltipContent>
			</Tooltip>
			{/* the topic info popup */}
			<PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-lg text-sm">
				<PopoverCloseButton />
				{topicInfo ? <TopicInfo topic={topicInfo} /> : <CoffeeLoading />}
			</PopoverContent>
		</Popover>
	)
}
