import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: serial().primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
