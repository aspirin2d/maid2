import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";

export const test = pgTable("test", {
  id: serial().primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
