import { showClientError } from "@carlnotes/client/apiClient"
import { sendCreateTopicInvite, sendUserInvite } from "@carlnotes/client/topicClient"
import { maxTopicFindingsOptions, visibilities } from "@carlnotes/contracts/enums"
import { toInvitePath } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import { updateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import { MAX_TOPIC_SOURCES, TOPIC_NAME_CHARS, type TopicResponse } from "@carlnotes/contracts/topics"
import { toUpdateTopicPayload, useTopicFields } from "@carlnotes/core/hooks/useTopicFields"
import { useTopicTeamChoice } from "@carlnotes/core/hooks/useTopicTeamChoice"
import { MISSING_FIELD_NOTES, saveTopic } from "@carlnotes/core/lib/saveTopic"
import { Globe, Link, Lock, Mail, X } from "lucide-react-native"
import { useRef } from "react"
import { Share, View } from "react-native"
import { ChoiceSelect } from "@/components/common/ChoiceSelect"
import { PreferenceSwitch } from "@/components/common/PreferenceSwitch"
import { deletePickedFile } from "@/components/common/pickedFileCache"
import { Sheet } from "@/components/common/Sheet"
import { InviteFields } from "@/components/invite/InviteFields"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { SessionTextInput } from "@/components/session/SessionTextInput"
import { usePageMutation } from "@/hooks/usePageMutation"
import { useTopicFeed } from "@/providers/TopicFeedProvider"
import { ScheduleFields } from "./EditTopicFields"
import { TagPicker } from "./TagPicker"
import {
	TopicAttachButton,
	TopicAttachmentEditor,
	type TopicAttachmentFile,
	uploadTopicAttachment,
	useTopicAttachmentCleanup,
} from "./TopicAttachmentEditor"
import { TopicSourceEditor } from "./TopicSourceEditor"
import { TopicTeamSelect } from "./TopicTeamSelect"

const VISIBILITY_ICONS = { private: Lock, public: Globe, invite: Mail }

/**
 * Uses the web Topic draft, team selection, Source editor, and save pipeline in a native sheet.
 */
export function EditTopicModal({
	topic,
	initialTeam,
	isMakingTopicPublic,
	onClose,
	onTopicSaved,
}: {
	topic?: TopicResponse
	initialTeam?: { teamId: string; name: string }
	isMakingTopicPublic?: boolean
	onClose: () => void
	onTopicSaved: (topicId: string, topicName: string) => void | Promise<void>
}) {
	const fields = useTopicFields<TopicAttachmentFile>(topic, isMakingTopicPublic)
	const topicTeam = useTopicTeamChoice(topic, initialTeam)
	const createdTopicId = useRef<string | null>(null)
	const { knownTags, topicFeed } = useTopicFeed()
	const mutation = usePageMutation()
	useTopicAttachmentCleanup(fields.pendingFiles)
	async function handleSave(): Promise<void> {
		if (!fields.name.trim()) {
			throw new Error(MISSING_FIELD_NOTES.name)
		}
		if (!fields.prompt.trim()) {
			throw new Error(MISSING_FIELD_NOTES.prompt)
		}
		if (fields.visibility !== "private" && !topicTeam.isTeamChosen) {
			throw new Error(topicTeam.loadError ?? MISSING_FIELD_NOTES.team)
		}
		const parsed = updateTopicPayload.safeParse(toUpdateTopicPayload(fields))
		if (!parsed.success) {
			throw new Error(parsed.error.issues[0]?.message ?? "Check the topic fields.")
		}
		const topicId = await saveTopic({
			topic,
			createdTopicId,
			fields,
			topicTeam,
			// upload the file, then delete its copy
			uploadAttachment: async (id, file) => {
				await uploadTopicAttachment(id, file)
				deletePickedFile(file)
			},
			onWarning: showClientError,
			sendUsernameInvites: async (id, usernames) => {
				for (const username of usernames) {
					const rejection = await sendUserInvite({ topicId: id }, { username })
					if (rejection) {
						showClientError(`The invitation to @${username} didn't go through.`)
					}
				}
			},
		})
		await onTopicSaved(topicId, fields.name)
		onClose()
	}
	return (
		<Sheet title={topic ? "Edit your topic" : "Your new topic"} onClose={onClose}>
			<View className="gap-4">
				{/* the same field order as the browser editor */}
				<SessionTextInput
					label="Title"
					value={fields.name}
					onChangeText={fields.setName}
					maxLength={TOPIC_NAME_CHARS}
				/>
				<View className="gap-2">
					<SessionTextInput
						label="Carl's Prompt"
						multiline
						className="min-h-28"
						value={fields.prompt}
						onChangeText={fields.setPrompt}
						placeholder={`Describe your topic.\n${fields.name.trim() || "You know the one."}`}
					/>
					<View className="flex-row items-center justify-between">
						<TopicAttachButton fields={fields} variant="icon" />
						{fields.prompt !== "" && (
							<Button
								variant="ghost"
								size="icon"
								accessibilityLabel="Clear prompt"
								onPress={() => fields.setPrompt("")}
							>
								<Icon as={X} className="size-4" />
							</Button>
						)}
					</View>
					{fields.promptSourceUrls.length > 0 && (
						<Text className="text-xs text-muted-foreground">Reading as a source:</Text>
					)}
					{fields.promptSourceUrls.map((url) => (
						<Button
							key={url}
							variant="secondary"
							size="sm"
							accessibilityLabel={`Don't read ${url}`}
							onPress={() => fields.dismissSourceUrl(url)}
						>
							<Text className="flex-1">{url}</Text>
							<Icon as={X} className="size-3" />
						</Button>
					))}
				</View>
				<TagPicker tags={fields.tags} knownTags={knownTags} onTagsChange={fields.setTags} />
				<ScheduleFields
					fields={fields}
					dailyTopicsRemaining={topicFeed?.dailyTopicsRemaining}
					dailyTopicLimit={topicFeed?.dailyTopicLimit}
					topicFrequency={topic?.frequency}
				/>
				<View className="flex-row flex-wrap gap-3">
					<View className="min-w-32 flex-1 gap-2">
						<Text className="text-sm font-medium">Max findings</Text>
						<ChoiceSelect
							label="Max findings"
							value={String(fields.maxTopicFindings)}
							options={maxTopicFindingsOptions.map((value) => ({ value: String(value), label: `Carl's top ${value}` }))}
							onChange={(value) => fields.setMaxTopicFindings(Number(value))}
						/>
					</View>
					<View className="min-w-32 flex-1 gap-2">
						<Text className="text-sm font-medium">Visibility</Text>
						<ChoiceSelect
							label="Visibility"
							value={fields.visibility}
							options={visibilities.map((value) => ({ value, label: value, icon: VISIBILITY_ICONS[value] }))}
							onChange={(value) => fields.setVisibility(value as typeof fields.visibility)}
						/>
					</View>
				</View>
				{fields.visibility !== "private" && (
					<View className="gap-4 border-y border-separator py-4">
						<TopicTeamSelect teamField={topicTeam} />
						<InviteFields
							label="Followers"
							invites={[...fields.emailInvites, ...fields.usernameInvites.map((name) => `@${name}`)]}
							onRemoveInvite={(label) => {
								if (label.startsWith("@")) {
									fields.setUsernameInvites(fields.usernameInvites.filter((name) => `@${name}` !== label))
								} else {
									fields.setEmailInvites(fields.emailInvites.filter((email) => email !== label))
								}
							}}
							onAddEmail={(email) => {
								if (fields.emailInvites.includes(email)) {
									return "That address is already invited."
								}
								fields.setEmailInvites([...fields.emailInvites, email])
								return null
							}}
							onAddUsername={(name) => {
								if (!fields.usernameInvites.includes(name)) {
									fields.setUsernameInvites([...fields.usernameInvites, name])
								}
							}}
							inviteLink={
								topic && (
									<Button
										variant="outline"
										accessibilityLabel="Invite by link"
										disabled={mutation.isPending}
										onPress={() =>
											void mutation.run(async () => {
												const invite = await sendCreateTopicInvite(topic.id, "share-sheet")
												if (invite === "limited") {
													throw new Error("Daily invite limit reached. It resets tomorrow.")
												}
												await Share.share({
													message: `Carl reads this topic and takes notes. Follow here: ${SITE_URL}${toInvitePath(invite.token)}`,
												})
											})
										}
									>
										<Icon as={Link} className="size-4" />
										<Text>Invite by link</Text>
									</Button>
								)
							}
						/>
					</View>
				)}
				<View className="gap-2">
					<Text className="text-sm font-medium">
						Sources <Text className="text-xs text-link">{`up to ${MAX_TOPIC_SOURCES}`}</Text>
					</Text>
					<TopicSourceEditor fields={fields} />
				</View>
				<View className="gap-2">
					<Text className="text-sm font-medium">Attachments</Text>
					<TopicAttachmentEditor fields={fields} />
				</View>
				{topic?.podcast && (
					<View className="flex-row items-center gap-2">
						<PreferenceSwitch
							label="Podcast"
							isChecked={fields.isPodcastEnabled}
							isDisabled={!topic.isTopicOwner}
							onChange={fields.setIsPodcastEnabled}
						/>
						<Text>Podcast</Text>
					</View>
				)}
				{mutation.error && (
					<Text accessibilityRole="alert" className="text-sm text-destructive">
						{mutation.error}
					</Text>
				)}
				<View className="flex-row justify-end gap-2">
					<Button variant="outline" accessibilityLabel="Cancel" disabled={mutation.isPending} onPress={onClose}>
						<Text>Cancel</Text>
					</Button>
					<Button
						accessibilityLabel="Save topic"
						disabled={mutation.isPending}
						onPress={() => void mutation.run(handleSave)}
					>
						<Text>{mutation.isPending ? "Saving…" : "Save"}</Text>
					</Button>
				</View>
			</View>
		</Sheet>
	)
}
