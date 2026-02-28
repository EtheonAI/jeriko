import type { Config } from "drizzle-kit";

export default {
  schema: "./src/storage/schema.ts",
  out: "./src/storage/migrations",
  dialect: "sqlite",
} satisfies Config;
