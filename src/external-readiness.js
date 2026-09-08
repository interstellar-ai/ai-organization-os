const compact = (value) => String(value || "").toLowerCase();

function taskContext(task, relatedTasks = []) {
  return compact([
    task.title,
    task.description,
    task.deliverable,
    task.context,
    ...relatedTasks.flatMap((item) => [
      item.title,
      item.deliverable,
      item.output?.summary,
      ...(item.output?.artifacts || []).map((artifact) => `${artifact.filename} ${String(artifact.content || "").slice(0, 4_000)}`)
    ])
  ].filter(Boolean).join("\n"));
}

export function inferExternalConnector(task, relatedTasks = []) {
  const direct = compact([task.title, task.description, task.deliverable, task.context].filter(Boolean).join("\n"));
  if (/\b(publish|publishing|listing|launch|release|storefront|sales channel|product page)\b/.test(direct)) return "publishing";
  if (/\b(crm|customer record|contact record|deal record|pipeline)\b/.test(direct)) return "crm";
  if (/\b(email|mailing|newsletter|send message|outreach message)\b/.test(direct)) return "email";
  if (/\b(research|source|fact[- ]?check|market evidence|competitor)\b/.test(direct)) return "web_research";
  const context = taskContext(task, relatedTasks);
  if (/\b(research|source|fact[- ]?check|market evidence|competitor)\b/.test(context)) return "web_research";
  if (/\b(crm|customer record|contact record|deal record|pipeline)\b/.test(context)) return "crm";
  if (/\b(email|mailing|newsletter|send message|outreach message)\b/.test(context)) return "email";
  if (/\b(publish|publishing|listing|launch|release|storefront|sales channel|product page)\b/.test(context)) return "publishing";
  return null;
}

const commonFounderSteps = [
  "Create the seller account using truthful legal and country information.",
  "Complete any identity, tax or business verification requested by the provider.",
  "Connect and verify an eligible payment account.",
  "Accept the provider terms and confirm that the product may lawfully be sold there.",
  "Return only the public store URL and readiness confirmations. Never paste a password, payment credential or API secret into this record."
];

const commonSystemSteps = [
  "Finalize the customer-facing files, listing copy, price and release terms.",
  "Prepare the exact product action for Founder approval.",
  "Publish through a scoped provider adapter when available and retain a receipt.",
  "Verify the public destination and continue outcome tracking."
];

const digitalStorefronts = [
  {
    provider: "Payhip",
    providerUrl: "https://payhip.com/",
    summary: "The AI organization selected Payhip as the default first-sale route for this small downloadable product.",
    reasons: [
      "The work package is a small one-time digital download rather than software or a subscription.",
      "The route supports hosted product files, a checkout page and low-friction first-sale validation.",
      "A free starting plan avoids a fixed monthly cost while demand is still unverified."
    ],
    tradeoff: "A simple digital storefront, but payment-account eligibility varies by country and may require a business PayPal account.",
    sourceUrls: ["https://help.payhip.com/article/376-cant-connect-paypal", "https://help.payhip.com/article/173-how-do-i-get-paid"]
  },
  {
    provider: "Ko-fi",
    providerUrl: "https://ko-fi.com/",
    summary: "The AI organization selected Ko-fi because it can connect a personal PayPal account and send payments directly without a platform payout threshold.",
    reasons: [
      "The Founder reported that only a personal PayPal account is available.",
      "Ko-fi states that a PayPal Business account is optional and supports digital products through Ko-fi Shop.",
      "Payments go directly to the connected PayPal account without a Ko-fi minimum payout balance."
    ],
    tradeoff: "Compatible with personal PayPal and direct payouts, but personal PayPal may expose the seller's legal name and email on transaction records.",
    sourceUrls: ["https://help.ko-fi.com/hc/en-us/articles/360005285593-How-do-I-switch-to-a-PayPal-Business-account", "https://help.ko-fi.com/hc/en-us/articles/115003980093-How-do-I-get-paid"]
  },
  {
    provider: "Gumroad",
    providerUrl: "https://gumroad.com/",
    summary: "The AI organization selected Gumroad as a broad individual-seller fallback for a hosted digital product.",
    reasons: [
      "Gumroad permits an individual seller profile without business registration documents.",
      "Both personal and business PayPal accounts are accepted where PayPal payouts are available.",
      "The platform hosts checkout and digital delivery, reducing setup work."
    ],
    tradeoff: "Broad individual-seller support, but payout availability is country-specific and standard payouts may have a minimum threshold.",
    sourceUrls: ["https://gumroad.com/help/article/260-your-payout-settings-page", "https://gumroad.com/help/article/13-getting-paid.html"]
  }
];

function digitalStorefrontRecommendation(profile = {}) {
  const excluded = new Set((profile.excludedProviders || []).map(compact));
  const personalPayPal = profile.accountType === "personal" && profile.paymentRail === "paypal";
  const ordered = personalPayPal
    ? [digitalStorefronts[1], digitalStorefronts[2], digitalStorefronts[0]]
    : digitalStorefronts;
  const selected = ordered.find((item) => !excluded.has(compact(item.provider)));
  if (!selected) return null;
  const alternatives = ordered.filter((item) => item.provider !== selected.provider && !excluded.has(compact(item.provider)))
    .map((item) => ({ provider: item.provider, tradeoff: item.tradeoff }));
  const rejected = digitalStorefronts.filter((item) => excluded.has(compact(item.provider)))
    .map((item) => ({ provider: item.provider, tradeoff: "Unavailable under the Founder's recorded account or regional constraints." }));
  return {
    connectorType: "publishing",
    category: "digital_download_storefront",
    provider: selected.provider,
    providerUrl: selected.providerUrl,
    summary: selected.summary,
    reasons: selected.reasons,
    alternatives: [...alternatives, ...rejected],
    founderSteps: commonFounderSteps,
    systemSteps: commonSystemSteps,
    sourceUrls: selected.sourceUrls,
    matchedConstraints: {
      ...(profile.countryCode ? { countryCode: profile.countryCode } : {}),
      ...(profile.accountType ? { accountType: profile.accountType } : {}),
      ...(profile.paymentRail ? { paymentRail: profile.paymentRail } : {})
    },
    knowledgeStatus: "Curated provider catalog reviewed on 2026-09-08; revalidate country support, fees and provider terms before production use."
  };
}

export function recommendExternalRoute(task, relatedTasks = [], profile = {}) {
  const connectorType = inferExternalConnector(task, relatedTasks);
  if (!connectorType || connectorType === "web_research") return null;
  const context = taskContext(task, relatedTasks);
  const digitalDownload = connectorType === "publishing"
    && /\b(digital product|download|template|toolkit|kit|ebook|pdf|markdown|docx|csv|zip)\b/.test(context);

  if (digitalDownload) return digitalStorefrontRecommendation(profile);

  const definitions = {
    publishing: {
      category: "content_publishing",
      provider: "Founder-owned publishing channel",
      providerUrl: "https://example.com/",
      summary: "The AI organization selected a Founder-owned channel because the task requires controlled publication rather than a digital storefront.",
      reasons: ["The task calls for publication but does not establish a digital-download checkout requirement.", "A Founder-owned destination keeps the audience, brand and rollback boundary explicit."],
      alternatives: [{ provider: "Configured publishing webhook", tradeoff: "More automation after a trusted HTTPS endpoint is available." }]
    },
    email: {
      category: "transactional_email",
      provider: "Resend",
      providerUrl: "https://resend.com/",
      summary: "The AI organization selected the supported Resend adapter for exact, approval-bound email delivery.",
      reasons: ["The runtime already implements a scoped Resend connector.", "Credentials remain server-side and each message requires exact-payload approval."],
      alternatives: [{ provider: "Another approved email provider", tradeoff: "Requires a new host-controlled adapter before execution." }]
    },
    crm: {
      category: "crm",
      provider: "HubSpot",
      providerUrl: "https://www.hubspot.com/",
      summary: "The AI organization selected the supported HubSpot adapter for approval-bound CRM record creation.",
      reasons: ["The runtime already implements a scoped HubSpot connector.", "Each record is previewed and bound to a one-use grant."],
      alternatives: [{ provider: "Another approved CRM", tradeoff: "Requires a new host-controlled adapter before execution." }]
    }
  };
  const selected = definitions[connectorType];
  if (!selected || (profile.excludedProviders || []).map(compact).includes(compact(selected.provider))) return null;
  return {
    connectorType,
    ...selected,
    founderSteps: [
      `Create or confirm the ${selected.provider} account using truthful legal information.`,
      "Complete required identity, organization and billing verification.",
      "Create the minimum scoped credential requested by the host adapter.",
      "Store credentials only in the server secret configuration. Never paste them into a task, chat or repository."
    ],
    systemSteps: ["Prepare the exact external payload.", "Request Founder approval for the consequential action.", "Execute through the scoped adapter and retain a receipt."],
    knowledgeStatus: "Curated provider catalog; revalidate provider terms and availability before production use."
  };
}
