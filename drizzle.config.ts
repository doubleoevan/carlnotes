// drizzle-kit config: generate migrations from the db package's schema files into its migrations folder
import { defineConfig } from "drizzle-kit"

// generate is offline; migrate reads DATABASE_URL (injected by `doppler run`)
export default defineConfig({
	dialect: "postgresql",
	schema: "./packages/db/schema/*.ts",
	out: "./packages/db/migrations",
	// migrate connects with this; an empty value during offline generate is fine
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
})
