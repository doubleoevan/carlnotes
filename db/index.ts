// the app's database client: a pooled Neon connection bound to the domain schema
import { Pool } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import * as schema from "./schema"

// one pooled Neon client for the app; it connects lazily on first query (Bun provides a global WebSocket)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// log background pool errors (idle-client failures) so an unhandled event never crashes the process
pool.on("error", (error: Error) => console.error("neon pool error", error))

// drizzle client bound to the full domain schema; consumers import table defs from ./schema directly
export const db = drizzle(pool, { schema })
