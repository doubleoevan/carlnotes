// the worker module entry. it exposes the topic scan, chat reply, and attachment functions that the api calls in-process
export {
	AttachmentValidationError,
	extractText,
	generateAttachmentContext,
	generateImageContext,
	ingestAttachment,
	ingestUrlAttachment,
	MAX_ATTACHMENT_BYTES,
	toCanonicalContentType,
} from "./attach"
export { type ChatReplyPart, type ChatReplyStream, type ChatTurnInput, streamChatReply } from "./chat"
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
export { deleteTopicPodcastEpisodeAudio, removePodcastEpisode } from "./podcast/removePodcastEpisode"
// whether an address is loopback, private, link-local, or reserved
export { isInternalAddress } from "./publicFetch"
export { failUnstartedScan, loadScan, scanTopic, startTopicScan, stopTopicScan } from "./scan"
export { failStaleScans, runScheduledTopicScans } from "./schedule"
export { toYoutubeVideoId } from "./scrape"
export { screenPendingSources, screenTopicSources } from "./screen"
export {
	attachmentExists,
	attachmentRangeStream,
	attachmentStream,
	deleteAttachment,
	getAttachmentBytes,
	toChatAttachmentKey,
	toChatRoomAttachmentKey,
	toLinkPreviewImageKey,
	toPodcastEpisodeAudioUrl,
	uploadAttachment,
} from "./store"
export { type SuggestedSource, suggestSources, toSourceKey } from "./suggest"
// trace the model-calls that the scheduled worker does
export { shutdownTelemetry, startTelemetry } from "./telemetry"
export { verifyUnsubscribeToken } from "./unsubscribe"
