/**
 * Airtable connector — bases, tables, records, and fields.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 * Airtable OAuth requires PKCE. Uses REST API with JSON bodies.
 */

import { BearerConnector } from "../base.js";

export class AirtableConnector extends BearerConnector {
  readonly name = "airtable";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://api.airtable.com/v0",
    tokenVar: "AIRTABLE_ACCESS_TOKEN",
    refreshTokenVar: "AIRTABLE_REFRESH_TOKEN",
    clientIdVar: "AIRTABLE_OAUTH_CLIENT_ID",
    clientSecretVar: "AIRTABLE_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    healthPath: "/meta/whoami",
    label: "Airtable",
  };

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      bases: "bases.list",
      records: "records.list",
      tables: "tables.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Airtable REST API
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Meta
      "whoami": () => this.get("/meta/whoami"),

      // Bases
      "bases.list": (p: Record<string, unknown>) =>
        this.get(`/meta/bases?offset=${p.offset ?? ""}`),
      "bases.get": (p: Record<string, unknown>) =>
        this.get(`/meta/bases/${p.id}/tables`),

      // Tables
      "tables.list": (p: Record<string, unknown>) =>
        this.get(`/meta/bases/${p.base_id}/tables`),
      "tables.create": (p: Record<string, unknown>) =>
        this.post(`/meta/bases/${p.base_id}/tables`, {
          name: p.name,
          fields: p.fields,
          description: p.description,
        }),

      // Records
      "records.list": (p: Record<string, unknown>) => {
        const qs: string[] = [];
        if (p.limit ?? p.maxRecords) qs.push(`maxRecords=${p.limit ?? p.maxRecords}`);
        if (p.view) qs.push(`view=${encodeURIComponent(String(p.view))}`);
        if (p.filter ?? p.filterByFormula) qs.push(`filterByFormula=${encodeURIComponent(String(p.filter ?? p.filterByFormula))}`);
        if (p.sort) qs.push(`sort%5B0%5D%5Bfield%5D=${encodeURIComponent(String(p.sort))}`);
        if (p.offset) qs.push(`offset=${encodeURIComponent(String(p.offset))}`);
        const query = qs.length ? `?${qs.join("&")}` : "";
        return this.get(`/${p.base_id}/${encodeURIComponent(String(p.table_id ?? p.table))}${query}`);
      },
      "records.get": (p: Record<string, unknown>) =>
        this.get(`/${p.base_id}/${encodeURIComponent(String(p.table_id ?? p.table))}/${p.id}`),
      "records.create": (p: Record<string, unknown>) =>
        this.post(`/${p.base_id}/${encodeURIComponent(String(p.table_id ?? p.table))}`, {
          records: p.records ?? [{ fields: p.fields }],
          typecast: p.typecast,
        }),
      "records.update": (p: Record<string, unknown>) =>
        this.patch(`/${p.base_id}/${encodeURIComponent(String(p.table_id ?? p.table))}`, {
          records: p.records ?? [{ id: p.id, fields: p.fields }],
          typecast: p.typecast,
        }),
      "records.delete": (p: Record<string, unknown>) => {
        const ids = Array.isArray(p.ids) ? p.ids : [p.id];
        const qs = ids.map((id) => `records[]=${id}`).join("&");
        return this.del(`/${p.base_id}/${encodeURIComponent(String(p.table_id ?? p.table))}?${qs}`);
      },

      // Fields
      "fields.create": (p: Record<string, unknown>) =>
        this.post(`/meta/bases/${p.base_id}/tables/${p.table_id}/fields`, {
          name: p.name,
          type: p.type,
          description: p.description,
          options: p.options,
        }),
      "fields.update": (p: Record<string, unknown>) =>
        this.patch(`/meta/bases/${p.base_id}/tables/${p.table_id}/fields/${p.id}`, {
          name: p.name,
          description: p.description,
        }),
    };
  }
}
