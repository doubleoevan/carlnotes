// the team routes the app reaches: teams, blocks, and reports

import { z } from "zod"
import type { ApiRouteContract } from "./apiRouteContracts"
import { blockedUsersResponse } from "./blocks"
import { inviteCreateResponse } from "./invites"
import {
	addTopicPayload,
	createTeamPayload,
	flagContentPayload,
	inviteCreatePayload,
	memberRolePayload,
	memberVisibilityPayload,
	updateTeamPayload,
} from "./payloads"
import { idAndUserParam, idParam, multipartFile, okResponse, teamNameQuery } from "./routeShapes"
import {
	teamCreateResponse,
	teamDeleteResponse,
	teamNameTakenResponse,
	teamPageResponse,
	teamsPageResponse,
} from "./teams"

// the entries, in client module order
export const teamRouteContracts: Record<string, ApiRouteContract> = {
	// teams
	"teamClient.fetchTeamNameTaken": {
		method: "GET",
		path: "/api/teams/name-check",
		query: teamNameQuery,
		response: teamNameTakenResponse,
	},
	"teamClient.fetchTeamPage": {
		method: "GET",
		path: "/api/teams/:id/page",
		params: idParam,
		response: teamPageResponse,
	},
	"teamClient.fetchTeams": { method: "GET", path: "/api/teams", response: teamsPageResponse },
	"teamClient.sendAddTopicTeam": {
		method: "POST",
		path: "/api/teams/:id/topics",
		params: idParam,
		body: { json: addTopicPayload },
		response: okResponse,
	},
	"teamClient.sendApproveJoinRequest": {
		method: "POST",
		path: "/api/teams/:id/join-requests/:userId/approve",
		params: idAndUserParam,
		response: okResponse,
	},
	"teamClient.sendCreateTeam": {
		method: "POST",
		path: "/api/teams",
		body: { json: createTeamPayload },
		response: teamCreateResponse,
	},
	"teamClient.sendCreateTeamInvite": {
		method: "POST",
		path: "/api/teams/:id/invites",
		params: idParam,
		body: { json: inviteCreatePayload },
		response: inviteCreateResponse,
	},
	"teamClient.sendDeleteJoinRequest": {
		method: "DELETE",
		path: "/api/teams/:id/join-requests/me",
		params: idParam,
		response: okResponse,
	},
	"teamClient.sendDeleteTeam": {
		method: "DELETE",
		path: "/api/teams/:id",
		params: idParam,
		response: teamDeleteResponse,
	},
	"teamClient.sendDeleteTeamInvite": {
		method: "DELETE",
		path: "/api/teams/:id/invites/:inviteId",
		params: z.object({ id: z.string(), inviteId: z.string() }),
		response: okResponse,
	},
	"teamClient.sendJoinRequest": {
		method: "POST",
		path: "/api/teams/:id/join-requests",
		params: idParam,
		response: okResponse,
	},
	"teamClient.sendRemoveTeamMember": {
		method: "DELETE",
		path: "/api/teams/:id/members/:userId",
		params: idAndUserParam,
		response: okResponse,
	},
	"teamClient.sendRemoveTopicFromTeam": {
		method: "DELETE",
		path: "/api/teams/:id/topics/:topicId",
		params: z.object({ id: z.string(), topicId: z.string() }),
		response: okResponse,
	},
	"teamClient.sendTeamAvatarBody": {
		method: "POST",
		path: "/api/teams/:id/avatar",
		params: idParam,
		body: { multipart: multipartFile("avatar") },
		response: okResponse,
	},
	"teamClient.sendTeamMemberRole": {
		method: "POST",
		path: "/api/teams/:id/members/:userId/role",
		params: idAndUserParam,
		body: { json: memberRolePayload },
		response: okResponse,
	},
	"teamClient.sendUpdateTeam": {
		method: "PATCH",
		path: "/api/teams/:id",
		params: idParam,
		body: { json: updateTeamPayload },
		response: okResponse,
	},
	"teamClient.setTeamMemberVisibility": {
		method: "POST",
		path: "/api/teams/:id/members/:userId/member-visibility",
		params: idAndUserParam,
		body: { json: memberVisibilityPayload },
		response: okResponse,
	},

	// blocks
	"blockClient.fetchBlockedUsers": { method: "GET", path: "/api/users/me/blocks", response: blockedUsersResponse },
	"blockClient.sendBlockUser": { method: "POST", path: "/api/users/:id/block", params: idParam, response: okResponse },
	"blockClient.sendUnblockUser": {
		method: "DELETE",
		path: "/api/users/:id/block",
		params: idParam,
		response: okResponse,
	},

	// reports
	"flagContentClient.sendFlagContent": {
		method: "POST",
		path: "/api/flag-content",
		body: { json: flagContentPayload },
		response: okResponse,
	},
}
