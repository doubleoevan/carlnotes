// the users table and Better Auth's tables: sessions, accounts, verifications, and the MCP OAuth tables
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
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

// the oauth applications table. Better Auth's row for one registered MCP client
export const oauthApplications = pgTable(
	"oauth_applications",
	{
		id: primaryId(),
		// the client's name, icon, and metadata as it registered them
		name: text("name").notNull(),
		icon: text("icon"),
		metadata: text("metadata"),
		// the client id and secret. empty for a public client
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		// the comma-joined redirect urls the client may return to, its type, and whether it is disabled
		redirectUrls: text("redirect_urls").notNull(),
		type: text("type").notNull(),
		disabled: boolean("disabled").default(false),
		// the user who was signed in when the client registered, if any
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("oauth_applications_user_id_idx").on(table.userId)],
)

// the oauth access tokens table. one access token and its refresh token, issued to a client acting as a user
export const oauthAccessTokens = pgTable(
	"oauth_access_tokens",
	{
		id: primaryId(),
		// the access and refresh tokens, and when each expires
		accessToken: text("access_token").notNull().unique(),
		refreshToken: text("refresh_token").notNull().unique(),
		accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at").notNull(),
		// the client the tokens were issued to, and the user it acts as
		clientId: text("client_id")
			.notNull()
			.references(() => oauthApplications.clientId, { onDelete: "cascade" }),
		userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
		// the space-joined scopes the tokens grant
		scopes: text("scopes").notNull(),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("oauth_access_tokens_client_id_idx").on(table.clientId),
		index("oauth_access_tokens_user_id_idx").on(table.userId),
	],
)

// the oauth consents table. whether a user let a client act as them, and for which scopes
export const oauthConsents = pgTable(
	"oauth_consents",
	{
		id: primaryId(),
		// the client that asked and the user who answered
		clientId: text("client_id")
			.notNull()
			.references(() => oauthApplications.clientId, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// the space-joined scopes asked for, and whether the user agreed
		scopes: text("scopes").notNull(),
		consentGiven: boolean("consent_given").notNull(),
		// plain timestamps, as Better Auth's own schema has them
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("oauth_consents_client_id_idx").on(table.clientId),
		index("oauth_consents_user_id_idx").on(table.userId),
	],
)
