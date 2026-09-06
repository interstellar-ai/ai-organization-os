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

export function recommendExternalRoute(task, relatedTasks = []) {
  const connectorType = inferExternalConnector(task, relatedTasks);
  if (!connectorType || connectorType === "web_research") return null;
  const context = taskContext(task, relatedTasks);
  const digitalDownload = connectorType === "publishing"
    && /\b(digital product|download|template|toolkit|kit|ebook|pdf|markdown|docx|csv|zip)\b/.test(context);

  if (connectorType === "publishing" && digitalDownload) {
    return {
      connectorType,
      category: "digital_download_storefront",
      provider: "Payhip",
      providerUrl: "https://payhip.com/",
      summary: "The AI organization selected Payhip as the default first-sale route for this small downloadable product.",
      reasons: [
        "The work package is a small one-time digital download rather than software or a subscription.",
        "The route supports hosted product files, a checkout page and low-friction first-sale validation.",
        "A free starting plan avoids a fixed monthly cost while demand is still unverified."
      ],
      alternatives: [
        { provider: "Gumroad", tradeoff: "Simple hosted checkout and tax handling, but the fixed and percentage fees are less attractive for a low-price test." },
        { provider: "Lemon Squeezy", tradeoff: "Strong merchant-of-record infrastructure, but store activation and payout timing add friction to a first-sale experiment." },
        { provider: "Ko-fi", tradeoff: "Fast direct payments and digital delivery, but its creator-support positioning is a weaker match for a focused business toolkit." }
      ],
      founderSteps: [
        "Create the seller account using truthful legal and country information.",
        "Complete any identity, tax or business verification requested by the provider.",
        "Connect and verify an eligible payment account.",
        "Accept the provider terms and confirm that the product may lawfully be sold there.",
        "Return only the public store URL and readiness confirmations. Never paste a password, payment credential or API secret into this record."
      ],
      systemSteps: [
        "Finalize the customer-facing files, listing copy, price and release terms.",
        "Prepare the exact product action for Founder approval.",
        "Publish through a scoped provider adapter when available and retain a receipt.",
        "Verify the public destination and continue outcome tracking."
      ],
      knowledgeStatus: "Curated provider catalog; revalidate fees, country support and provider terms before production use."
    };
  }

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
  if (!selected) return null;
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
