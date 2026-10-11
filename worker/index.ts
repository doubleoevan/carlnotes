// the worker module entry. it exposes the topic scan, chat reply, and attachment functions that the api calls in-process
export {
	generateAttachmentContext,
	generateImageContext,
	ingestAttachment,
	ingestUrlAttachment,
	MAX_ATTACHMENT_BYTES,
} from "./attach"
export { AttachmentValidationError, toCanonicalContentType } from "./attachContentType"
export { extractText } from "./attachText"
// the chat reply, one chat turn's input, and the topic search behind the chat routes
export { type ChatReplyPart, type ChatReplyStream, streamChatReply } from "./chat"
export type { ChatTurnInput } from "./chat/chatMessages"
export { type RankedTopicFinding, searchTopicFindings } from "./chat/retrieve"
export { notifyIndexNow } from "./indexNow"
export { lookupPodcast } from "./ingest/podcast"
export {
	fetchLinkPreviewImage,
	fetchLinkPreviewMetadata,
	type LinkPreviewMetaTags,
	toLinkPreviewUrls,
	toNormalizedLinkPreviewUrl,
} from "./linkPreview"
// each user's LiteLLM key
export {
	deleteLiteLLMKey,
	deleteUserLiteLLMKey,
	isUserLiteLLMKeyBudgetExhausted,
	loadOrProvisionUserLiteLLMKey,
	provisionLiteLLMKey,
	readLiteLLMKeySpend,
	replaceUserLiteLLMKey,
} from "./litellm"
export { isBudgetRejection, MODEL_CHAT_TURN_FAILED_REJECTION, SPENT_BUDGET_REJECTION } from "./models"
export { loadTopicPodcastEpisodeAudioKeys, removePodcastEpisode } from "./podcast/removePodcastEpisode"
// whether an address is loopback, private, link-local, or reserved
export { isInternalAddress } from "./publicFetch"
export { failUnstartedScan, loadScan, scanTopic, startTopicScan, stopTopicScan } from "./scan"
export { runScheduledTopicScans } from "./schedule"
export { toYoutubeVideoId } from "./scrape"
export { screenPendingSources, screenTopicSources } from "./screen"
export { failStaleScans } from "./staleScans"
export {
	attachmentExists,
	attachmentRangeStream,
	attachmentStream,
	clearPendingObjectDeletion,
	deleteStoredObject,
	deleteStoredObjects,
	getAttachmentBytes,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	toChatAttachmentKey,
	toChatRoomAttachmentKey,
	toLinkPreviewImageKey,
	toPodcastEpisodeAudioUrl,
	toStoredObjectKeys,
	uploadAttachment,
} from "./store"
export { type SuggestedSource, suggestSources, toSourceKey } from "./suggest"
// trace the model-calls that the scheduled worker does
export { shutdownTelemetry, startTelemetry } from "./telemetry"
export { verifyUnsubscribeToken } from "./unsubscribe"
