import dns from "node:dns/promises";
import crypto from "node:crypto";
import net from "node:net";

const text = (value, name, limit = 20_000) => {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > limit) throw new Error(`${name} is required and must be at most ${limit} characters`);
  return result;
};
const privateAddress = (address) => {
  const normalized = String(address).toLowerCase();
  if (normalized.startsWith("::ffff:")) return privateAddress(normalized.slice(7));
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 198 && [18, 19].includes(b));
  }
  return net.isIPv6(normalized) && (normalized === "::" || normalized === "::1" || /^(?:fc|fd|fe8|fe9|fea|feb)/.test(normalized));
};
const stripHtml = (value) => String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function publicHttpsUrl(value, lookup = dns.lookup) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Connector URLs must use public HTTPS without embedded credentials or custom ports");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new Error("Connector URL resolved to a private or unavailable address");
  return url;
}

async function responseBody(response, maximum = 500_000) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximum) throw new Error("Connector response exceeded the configured size limit");
  return bytes.toString("utf8");
}

class WebResearchConnector {
  constructor(options) { Object.assign(this, options); }
  status() { return { type: "web_research", configured: true, capabilities: ["explicit HTTPS sources", ...(this.braveKey ? ["web search"] : [])] }; }
  preview(payload = {}) {
    const urls = Array.isArray(payload.urls) ? payload.urls : [];
    if (!urls.length && !this.braveKey) throw new Error("Provide source URLs or configure BRAVE_SEARCH_API_KEY");
    if (urls.length > 5) throw new Error("Web research accepts at most five source URLs");
    const sourceUrls = urls.map((value) => {
      if (typeof value !== "string" || value.length > 2_048) throw new Error("Each research source must be a valid HTTPS URL");
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Research sources must use HTTPS without embedded credentials or custom ports");
      return url.toString();
    });
    const query = payload.query ? text(payload.query, "Research query", 2_000) : null;
    return { query, sourceUrls, maximumSources: 5 };
  }
  async fetchText(value) {
    let url = await publicHttpsUrl(value, this.lookup);
    for (let redirect = 0; redirect < 4; redirect += 1) {
      const response = await this.fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "AI-Organization-OS/0.9" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.headers.get("location")) throw new Error("Research source returned an invalid redirect");
        url = await publicHttpsUrl(new URL(response.headers.get("location"), url).toString(), this.lookup);
        continue;
      }
      if (!response.ok) throw new Error(`Research source returned HTTP ${response.status}`);
      const type = response.headers.get("content-type") || "";
      if (!/(?:text|json|xml|html)/i.test(type)) throw new Error("Research source did not return readable text");
      return { url: url.toString(), content: stripHtml(await responseBody(response)).slice(0, 100_000) };
    }
    throw new Error("Research source exceeded the redirect limit");
  }
  async execute(payload) {
    const preview = this.preview(payload);
    let urls = [...preview.sourceUrls];
    if (!urls.length && preview.query) {
      const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
      endpoint.searchParams.set("q", preview.query);
      endpoint.searchParams.set("count", "5");
      const response = await this.fetch(endpoint, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/json", "x-subscription-token": this.braveKey } });
      if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);
      const result = JSON.parse(await responseBody(response));
      urls = (result.web?.results || []).map((item) => item.url).slice(0, 5);
    }
    if (!urls.length) throw new Error("No research sources were found");
    const sources = [];
    for (const url of urls) sources.push(await this.fetchText(url));
    const content = sources.map((source, index) => `## Source ${index + 1}\n\nURL: ${source.url}\n\n${source.content}`).join("\n\n");
    return { summary: `Retrieved ${sources.length} live sources.`, receiptId: crypto.randomUUID(), sources: sources.map((item) => item.url),
      artifacts: [{ filename: "live-research-sources.md", content }] };
  }
}

class ResendConnector {
  constructor(options) { Object.assign(this, options); }
  status() { return { type: "email", configured: Boolean(this.apiKey && this.from), capabilities: ["send email"] }; }
  preview(payload = {}) {
    const recipient = text(payload.to, "Recipient", 320);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Recipient must be a valid email address");
    return { to: recipient, subject: text(payload.subject, "Subject", 500),
      bodyPreview: text(payload.text, "Message", 50_000).slice(0, 500), from: this.from || "Not configured" };
  }
  async execute(payload, context) {
    if (!this.status().configured) throw new Error("Email connector is not configured");
    this.preview(payload);
    const response = await this.fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", "idempotency-key": context.idempotencyKey },
      body: JSON.stringify({ from: this.from, to: [payload.to], subject: payload.subject, text: payload.text }) });
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
    const result = JSON.parse(await responseBody(response));
    return { summary: "Email provider accepted the approved message.", receiptId: result.id || context.idempotencyKey, artifacts: [] };
  }
}

class HubSpotConnector {
  constructor(options) { Object.assign(this, options); }
  status() { return { type: "crm", configured: Boolean(this.accessToken), capabilities: ["create CRM object"] }; }
  preview(payload = {}) {
    if (!["contacts", "companies", "deals"].includes(payload.objectType)) throw new Error("CRM object type must be contacts, companies, or deals");
    if (!payload.properties || typeof payload.properties !== "object" || Array.isArray(payload.properties)) throw new Error("CRM properties are required");
    const entries = Object.entries(payload.properties);
    if (!entries.length || entries.length > 50) throw new Error("CRM properties must contain between one and fifty fields");
    const properties = Object.fromEntries(entries.map(([key, value]) => {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(key) || ["constructor", "prototype"].includes(key)) throw new Error("CRM property name is invalid");
      return [key, text(String(value), `CRM property ${key}`, 10_000)];
    }));
    return { objectType: payload.objectType, properties };
  }
  async execute(payload, context) {
    if (!this.status().configured) throw new Error("CRM connector is not configured");
    this.preview(payload);
    const response = await this.fetch(`https://api.hubapi.com/crm/v3/objects/${payload.objectType}`, { method: "POST", signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json", "x-ai-org-idempotency-key": context.idempotencyKey },
      body: JSON.stringify({ properties: payload.properties }) });
    if (!response.ok) throw new Error(`CRM provider returned HTTP ${response.status}`);
    const result = JSON.parse(await responseBody(response));
    return { summary: `CRM ${payload.objectType} record was created.`, receiptId: result.id || context.idempotencyKey, artifacts: [] };
  }
}

class PublishingConnector {
  constructor(options) { Object.assign(this, options); }
  status() { return { type: "publishing", configured: Boolean(this.webhookUrl && this.token), capabilities: ["publish through configured webhook"] }; }
  preview(payload = {}) { return { destination: text(payload.destination, "Destination", 500), title: payload.title?.trim() || null, contentPreview: text(payload.content, "Content", 100_000).slice(0, 1_000) }; }
  async execute(payload, context) {
    if (!this.status().configured) throw new Error("Publishing connector is not configured");
    this.preview(payload);
    const endpoint = await publicHttpsUrl(this.webhookUrl, this.lookup);
    const response = await this.fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(20_000), headers: { authorization: `Bearer ${this.token}`,
      "content-type": "application/json", "idempotency-key": context.idempotencyKey }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Publishing provider returned HTTP ${response.status}`);
    const result = JSON.parse(await responseBody(response));
    return { summary: "Publishing destination accepted the approved content.", receiptId: result.id || context.idempotencyKey, url: result.url || null, artifacts: [] };
  }
}

export class ConnectorRegistry {
  constructor(options = {}) {
    const fetcher = options.fetch || globalThis.fetch;
    const lookup = options.lookup || dns.lookup;
    const environment = options.environment || process.env;
    this.connectors = new Map([
      ["web_research", new WebResearchConnector({ fetch: fetcher, lookup, braveKey: environment.BRAVE_SEARCH_API_KEY })],
      ["email", new ResendConnector({ fetch: fetcher, apiKey: environment.RESEND_API_KEY, from: environment.AI_ORG_EMAIL_FROM })],
      ["crm", new HubSpotConnector({ fetch: fetcher, accessToken: environment.HUBSPOT_ACCESS_TOKEN })],
      ["publishing", new PublishingConnector({ fetch: fetcher, lookup, webhookUrl: environment.AI_ORG_PUBLISH_WEBHOOK_URL, token: environment.AI_ORG_PUBLISH_WEBHOOK_TOKEN })]
    ]);
  }
  list() { return [...this.connectors.values()].map((connector) => connector.status()); }
  get(type) { const connector = this.connectors.get(type); if (!connector) throw new Error("Unknown external connector"); return connector; }
  preview(type, payload) { return this.get(type).preview(payload); }
  execute(type, payload, context) { return this.get(type).execute(payload, context); }
}
