import type { Client, InValue, ResultSet } from "@libsql/client";
import type { Database, Statement } from "./types";
/** D1-compatible query surface; batches remain atomic on one libSQL transaction. */
export function libsqlDatabase(client: Client): Database {
  class Prepared implements Statement {
    constructor(
      readonly sql: string,
      readonly args: InValue[] = [],
    ) {}
    bind(...values: unknown[]) {
      const args = values.map((value) => {
        if (
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "bigint"
        )
          return value;
        throw new TypeError("Unsupported SQL parameter");
      });
      return new Prepared(this.sql, args);
    }
    async first<T>() {
      const result = await client.execute({ sql: this.sql, args: this.args });
      return (result.rows[0] as T | undefined) ?? null;
    }
    async all<T>() {
      const result = await client.execute({ sql: this.sql, args: this.args });
      return { results: result.rows as T[] };
    }
  }
  return {
    prepare: (sql) => new Prepared(sql),
    async batch(statements) {
      const batch = statements.map((statement) => {
        if (!(statement instanceof Prepared))
          throw new TypeError("Statement belongs to a different database");
        return { sql: statement.sql, args: statement.args };
      });
      const results = await client.batch(batch, "write");
      return results.map((r: ResultSet) => ({
        meta: { changes: r.rowsAffected },
      }));
    },
  };
}
