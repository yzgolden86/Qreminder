import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = BaseSQLiteDatabase<any, any, typeof schema>;
