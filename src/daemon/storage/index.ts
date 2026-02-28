// Storage — re-exports. Import as `@jeriko/storage`.

export { initDatabase, getDatabase, runMigrations, closeDatabase } from "./db.js";
export { kvSet, kvGet, kvDelete, kvList } from "./kv.js";
export type {
  Session,
  Message,
  Part,
  AuditLog,
  Trigger,
  KeyValue,
} from "./schema.js";
export {
  SQL_CREATE_SESSION,
  SQL_CREATE_MESSAGE,
  SQL_CREATE_PART,
  SQL_CREATE_AUDIT_LOG,
  SQL_CREATE_TRIGGER,
  SQL_CREATE_KEY_VALUE,
  ALL_CREATE_TABLES,
} from "./schema.js";
