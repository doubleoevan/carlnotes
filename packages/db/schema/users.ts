// the users table and Better Auth's tables: sessions, accounts, verifications, and the MCP OAuth server's tables
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { avatarSource, inviteAccess, plan, primaryId } from "./columns"

// the users table
export const users = pgTable(
	"users",
	{
		id: primaryId(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").default(false).notNull(),
		image: text("image"),
		// the public username as the user sees it, generated during signup so a row is never null
		username: text("username").notNull(),
		// the normalized username to search for already taken ones
		usernameNormalized: text("username_normalized").notNull(),
		// where the public avatar comes from, and the stored object for it
		avatarSource: avatarSource("avatar_source").notNull().default("generated"),
		avatarKey: text("avatar_key"),
		// this user's LiteLLM virtual key, which has the user's spend budget.
		// null until the key is created, at signup or at the user's first model call if the proxy failed at signup
		litellmVirtualKey: text("litellm_virtual_key"),
		// when that key was created, and the signup time while the user has no key.
		// a key created before the current month is due for the monthly reset
		litellmKeyCreatedAt: timestamp("litellm_key_created_at", { withTimezone: true }).defaultNow().notNull(),
		// the platform role: "admin" or "user". plain text to match Better Auth's admin plugin shape
		role: text("role").notNull().default("user"),
		// who may address an invite to this user, enforced at invite creation and nowhere else
		inviteAccess: inviteAccess("invite_access").notNull().default("anyone"),
		// the billing plan
		plan: plan("plan").notNull().default("free"),
		// a per-user monthly spend override in cents. an admin can raise or lower it, and null falls back to the plan's backstop
		budgetOverrideCents: integer("budget_override_cents"),
		// when this user last signed in, written on every session creation. null until they sign in again
		lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	// enforces username uniqueness, compared on the normalized form
	(table) => [
		uniqueIndex("users_username_normalized_unique").on(table.usernameNormalized),
		// the trigram index behind the username search, which matches anywhere in the name
		index("users_username_normalized_trgm").using("gin", table.usernameNormalized.op("gin_trgm_ops")),
	],
)

// the sessions table. Better Auth's record of one signed-in session for a user
export const sessions = pgTable(
	"sessions",
	{
		id: primaryId(),
		// the owning user
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the session token and its expiry
		token: text("token").notNull().unique(),
		expiresAt: timestamp("expires_at").notNull(),
		// client metadata captured at session creation
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("sessions_user_id_idx").on(table.userId)],
)

// the accounts table
export const accounts = pgTable(
	"accounts",
	{
		id: primaryId(),
		// the owning user
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// which provider this identity lives at, and the user's account id there
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		// oauth grant. null for the password credential provider
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		// the hashed password. only set for the password credential provider
		password: text("password"),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("accounts_user_id_idx").on(table.userId)],
)

// the verifications table. Better Auth's one-time tokens for email verification and similar flows
export const verifications = pgTable(
	"verifications",
	{
		id: primaryId(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("verifications_identifier_idx").on(table.identifier)],
)

// the signing keys that Better Auth's jwt plugin signs MCP access tokens with, published at the auth path's jwks
export const jwks = pgTable("jwks", {
	id: primaryId(),
	// the key pair as JSON web keys. the private key is encrypted with the auth secret
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	// the key's algorithm and curve, and when it stops signing
	alg: text("alg"),
	crv: text("crv"),
	createdAt: timestamp("created_at").notNull(),
	expiresAt: timestamp("expires_at"),
})

// the oauth clients table. Better Auth's row for one registered MCP client, from dynamic registration or a client
// metadata document
export const oauthClients = pgTable(
	"oauth_clients",
	{
		id: primaryId(),
		// the client id and secret. no secret for a public client
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		// how the client was discovered: null for dynamic registration, cimd for a client metadata document
		clientDiscoveryId: text("client_discovery_id"),
		// whether the client is disabled, skips consent, and may end a session
		disabled: boolean("disabled").default(false),
		skipConsent: boolean("skip_consent"),
		enableEndSession: boolean("enable_end_session"),
		subjectType: text("subject_type"),
		// the scopes the client may ask for, and the machine scopes for a client credentials grant
		scopes: text("scopes").array(),
		clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
		// the user who was signed in when the client registered, if any
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
		// the client's name, links, and contacts as it registered them
		name: text("name"),
		uri: text("uri"),
		icon: text("icon"),
		contacts: text("contacts").array(),
		tos: text("tos"),
		policy: text("policy"),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		// where the client may return to after authorizing and after signing out
		redirectUris: text("redirect_uris").array().notNull(),
		postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
		backchannelLogoutUri: text("backchannel_logout_uri"),
		backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
		// how the client authenticates at the token endpoint, and the grants and responses it uses
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		applicationType: text("application_type"),
		jwks: text("jwks"),
		jwksUri: text("jwks_uri"),
		grantTypes: text("grant_types").array(),
		responseTypes: text("response_types").array(),
		requirePKCE: boolean("require_pkce"),
		dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
		referenceId: text("reference_id"),
		metadata: jsonb("metadata"),
	},
	(table) => [index("oauth_clients_user_id_idx").on(table.userId)],
)

// the oauth resources table. each protected resource a token can be bound to, written from the plugin's config at
// startup. the MCP server's url is the one resource
export const oauthResources = pgTable("oauth_resources", {
	id: primaryId(),
	identifier: text("identifier").notNull().unique(),
	name: text("name").notNull(),
	// the token lifetimes, signing, scopes, and claims for tokens bound to this resource
	accessTokenTtl: integer("access_token_ttl"),
	refreshTokenTtl: integer("refresh_token_ttl"),
	signingAlgorithm: text("signing_algorithm"),
	signingKeyId: text("signing_key_id"),
	allowedScopes: text("allowed_scopes").array(),
	customClaims: jsonb("custom_claims"),
	dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
	disabled: boolean("disabled").default(false),
	// plain timestamps, as Better Auth's own schema has them
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
	policyVersion: integer("policy_version").default(1),
	metadata: jsonb("metadata"),
})

// the oauth client resources table. which resources a client may ask a token for
export const oauthClientResources = pgTable(
	"oauth_client_resources",
	{
		id: primaryId(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: "cascade" }),
		resourceId: text("resource_id")
			.notNull()
			.references(() => oauthResources.identifier, { onDelete: "cascade" }),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at"),
	},
	(table) => [
		index("oauth_client_resources_client_id_idx").on(table.clientId),
		index("oauth_client_resources_resource_id_idx").on(table.resourceId),
		uniqueIndex("oauth_client_resources_client_id_resource_id_uidx").on(table.clientId, table.resourceId),
	],
)

// the oauth refresh tokens table. one refresh token issued to a client acting as a user, stored hashed
export const oauthRefreshTokens = pgTable(
	"oauth_refresh_tokens",
	{
		id: primaryId(),
		token: text("token").notNull().unique(),
		// the client the token was issued to, the user it acts as, and the session it came from
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		// the authorization code the token came from, so a replayed code revokes it
		authorizationCodeId: text("authorization_code_id"),
		// what the token is bound to and may read
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		scopes: text("scopes").array().notNull(),
		// when the token expires, was revoked, or was rotated, and the response a retried rotation gets back
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at"),
		revoked: timestamp("revoked"),
		rotatedAt: timestamp("rotated_at"),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: timestamp("rotation_replay_expires_at"),
		authTime: timestamp("auth_time"),
		confirmation: jsonb("confirmation"),
	},
	(table) => [
		index("oauth_refresh_tokens_client_id_idx").on(table.clientId),
		index("oauth_refresh_tokens_session_id_idx").on(table.sessionId),
		index("oauth_refresh_tokens_user_id_idx").on(table.userId),
		index("oauth_refresh_tokens_authorization_code_id_idx").on(table.authorizationCodeId),
	],
)

// the oauth access tokens table. an opaque access token issued to a client acting as a user, stored hashed. a token
// bound to the MCP resource is a signed JWT and has no row
export const oauthAccessTokens = pgTable(
	"oauth_access_tokens",
	{
		id: primaryId(),
		token: text("token").unique(),
		// the client the token was issued to, the user it acts as, and the session it came from
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		// the authorization code and the refresh token the access token came from
		authorizationCodeId: text("authorization_code_id"),
		refreshId: text("refresh_id").references(() => oauthRefreshTokens.id, { onDelete: "cascade" }),
		// what the token is bound to and may read
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		scopes: text("scopes").array().notNull(),
		// when the token expires or was revoked
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at"),
		revoked: timestamp("revoked"),
		confirmation: jsonb("confirmation"),
	},
	(table) => [
		index("oauth_access_tokens_client_id_idx").on(table.clientId),
		index("oauth_access_tokens_session_id_idx").on(table.sessionId),
		index("oauth_access_tokens_user_id_idx").on(table.userId),
		index("oauth_access_tokens_authorization_code_id_idx").on(table.authorizationCodeId),
		index("oauth_access_tokens_refresh_id_idx").on(table.refreshId),
	],
)

// the oauth consents table. which scopes a user let a client have
export const oauthConsents = pgTable(
	"oauth_consents",
	{
		id: primaryId(),
		// the client that asked and the user who answered
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClients.clientId, { onDelete: "cascade" }),
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		// what the user let the client have
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		scopes: text("scopes").array().notNull(),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at"),
		updatedAt: timestamp("updated_at"),
	},
	(table) => [
		index("oauth_consents_client_id_idx").on(table.clientId),
		index("oauth_consents_user_id_idx").on(table.userId),
	],
)

// the oauth client assertions table. each private key JWT assertion's id, kept until it expires so it is used once
export const oauthClientAssertions = pgTable("oauth_client_assertions", {
	id: primaryId(),
	expiresAt: timestamp("expires_at").notNull(),
})
