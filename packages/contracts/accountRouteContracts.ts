// the account routes the app reaches: activity, the app sign-up gate, billing, profiles and the account, push, and the
// Terms

import { z } from "zod"
import { activityResponse } from "./activity"
import type { ApiRouteContract } from "./apiRouteContracts"
import { inviteAcceptResponse } from "./invites"
import {
	inviteAccessPayload,
	inviteDeletePayload,
	storeCheckoutPayload,
	storeSubscriptionSyncPayload,
	usernamePayload,
} from "./payloads"
import { profileResponse } from "./profilePage"
import { billingState, profileTeamStatusesResponse } from "./profiles"
import { pushDeviceDeletePayload, pushDevicePayload, pushPreferencePayload } from "./pushDevices"
import {
	appSignupChallengeResponse,
	idParam,
	multipartFile,
	okResponse,
	topicInviteBadgesResponse,
	userIdParam,
	userIdQuery,
} from "./routeShapes"
import { appSignupProofPayload } from "./signupGate"
import { termsAcceptanceResponse } from "./terms"

// the entries, in client module order
export const accountRouteContracts: Record<string, ApiRouteContract> = {
	// activity
	"activityClient.fetchActivity": {
		method: "GET",
		path: "/api/activity",
		query: userIdQuery,
		response: activityResponse,
	},
	"activityClient.fetchTopicInviteBadges": {
		method: "GET",
		path: "/api/invites/topics/pending",
		response: topicInviteBadgesResponse,
	},
	"activityClient.sendAcceptInvite": {
		method: "POST",
		path: "/api/invites/:id/accept",
		params: idParam,
		response: inviteAcceptResponse,
	},
	"activityClient.sendDeclineInvite": {
		method: "POST",
		path: "/api/invites/:id/decline",
		params: idParam,
		response: okResponse,
	},
	"activityClient.sendDeleteTopicInvite": {
		method: "DELETE",
		path: "/api/topics/:id/invite",
		params: idParam,
		body: { json: inviteDeletePayload },
		response: okResponse,
	},

	// the app sign-up gate
	"authClient.fetchAppSignupChallenge": {
		method: "POST",
		path: "/api/signup-gate/app-challenge",
		response: appSignupChallengeResponse,
	},
	"authClient.passAppSignupGate": {
		method: "POST",
		path: "/api/signup-gate/app",
		body: { json: appSignupProofPayload },
		response: okResponse,
	},

	// billing
	"billingClient.fetchBillingState": {
		method: "GET",
		path: "/api/billing/state",
		query: userIdQuery,
		response: billingState,
	},
	"billingClient.sendStoreCheckoutStarted": {
		method: "POST",
		path: "/api/billing/store/checkout",
		body: { json: storeCheckoutPayload },
		response: okResponse,
	},
	"billingClient.sendStoreSubscriptionSync": {
		method: "POST",
		path: "/api/billing/store/sync",
		body: { json: storeSubscriptionSyncPayload },
		response: billingState,
	},

	// profiles and the account
	"profileClient.fetchProfile": {
		method: "GET",
		path: "/api/profiles/:userId",
		params: userIdParam,
		response: profileResponse,
	},
	"profileClient.fetchProfileTeamStatuses": {
		method: "GET",
		path: "/api/profiles/:userId/team-statuses",
		params: userIdParam,
		response: profileTeamStatusesResponse,
	},
	"profileClient.sendAvatarSource": {
		method: "POST",
		path: "/api/avatars",
		body: { multipart: z.object({ avatarSource: z.enum(["generated", "oauth"]) }) },
		response: okResponse,
	},
	"profileClient.sendDeleteAccount": { method: "DELETE", path: "/api/users/me", response: okResponse },
	"profileClient.sendInviteAccess": {
		method: "POST",
		path: "/api/users/me/invite-access",
		body: { json: inviteAccessPayload },
		response: okResponse,
	},
	"profileClient.sendUsername": {
		method: "POST",
		path: "/api/usernames",
		body: { json: usernamePayload },
		response: okResponse,
	},
	"profileClient.uploadAvatarBody": {
		method: "POST",
		path: "/api/avatars",
		body: { multipart: multipartFile("avatar") },
		response: okResponse,
	},

	// push
	"pushClient.sendDeletePushDevice": {
		method: "DELETE",
		path: "/api/push-devices",
		body: { json: pushDeviceDeletePayload },
		response: okResponse,
	},
	"pushClient.sendPushDevice": {
		method: "POST",
		path: "/api/push-devices",
		body: { json: pushDevicePayload },
		response: okResponse,
	},
	"pushClient.sendPushPreference": {
		method: "POST",
		path: "/api/users/me/push-preferences",
		body: { json: pushPreferencePayload },
		response: okResponse,
	},

	// the Terms
	"termsClient.sendTermsAcceptance": {
		method: "POST",
		path: "/api/users/me/terms-acceptance",
		response: termsAcceptanceResponse,
	},
}
