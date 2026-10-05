import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  owner: text("owner").primaryKey(),
  currentId: text("current_id"),
  revision: integer("revision").notNull().default(0),
});
export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    createdAt: text("created_at").notNull(),
    mode: text("mode").notNull(),
    contractName: text("contract_name").notNull(),
    policyName: text("policy_name"),
    sections: text("sections").notNull(),
    warnings: text("warnings").notNull(),
    contractKey: text("contract_key"),
    policyKey: text("policy_key"),
  },
  (t) => [index("idx_versions_owner").on(t.owner)],
);
export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id").notNull(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [index("idx_items_version").on(t.versionId)],
);
export const history = sqliteTable(
  "history",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    versionId: text("version_id").notNull(),
    itemId: text("item_id"),
    action: text("action").notNull(),
    createdAt: text("created_at").notNull(),
    before: text("before"),
    after: text("after"),
  },
  (t) => [index("idx_history_owner_created").on(t.owner, t.createdAt)],
);
