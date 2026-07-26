// The connector catalogue.
//
// WHAT A CONNECTOR IS
// A link between a project and a service the user already pays for —
// their Supabase, their GitHub, their Stripe. Not a package (see
// packages.ts) and not a platform feature: a credential the user owns,
// scoped to one project.
//
// WHY THE WHOLE LIST IS HERE AND NOT JUST THE WORKING ONES
// Two are wired up. Showing only those two answers "what can this do?"
// with "almost nothing", which is both discouraging and untrue about
// the direction. Showing all of them with honest status answers the
// real question — is the thing I need coming? — and every "soon" entry
// carries a link to the service so the answer is useful today even
// when the integration is not.
//
// The rule: `status` must never flatter. An entry is "available" only
// when linking it actually does something.

export type ConnectorStatus =
  /** Wired up. Linking it changes what the project can do. */
  | "available"
  /** Catalogued and planned. The card links out to the service. */
  | "soon";

export type ConnectorCategory =
  | "Backend"
  | "Ecommerce"
  | "Marketing"
  | "Messaging"
  | "Productivity"
  | "Sales"
  | "Google"
  | "Microsoft"
  | "AWS"
  | "Developer"
  | "AI"
  | "Payments"
  | "Analytics";

export interface Connector {
  id: string;
  name: string;
  /** One line, sentence case, says what it does for a project. */
  blurb: string;
  category: ConnectorCategory;
  status: ConnectorStatus;
  /** The service's own site. The useful thing on a "soon" card. */
  url: string;
  /** Two letters for the tile. Brand logos are not ours to ship. */
  mark: string;
  /** Tile colour. Approximate brand hue, not the logo. */
  tint: string;
  /** Only for available ones: what the user must paste. */
  fields?: Array<{ key: string; label: string; placeholder: string }>;
  secretLabel?: string;
  secretHint?: string;
}

export const CONNECTORS: Connector[] = [
  // ── Available ────────────────────────────────────────────
  {
    id: "supabase",
    name: "Supabase",
    blurb: "Connect an external Supabase project, so this app's data lives in a database you own.",
    category: "Backend",
    status: "available",
    url: "https://supabase.com",
    mark: "SB",
    tint: "#3ecf8e",
    fields: [
      { key: "url", label: "Project URL", placeholder: "https://xxxxx.supabase.co" },
      { key: "ref", label: "Project ref (optional)", placeholder: "xxxxx" },
    ],
    secretLabel: "Service role key",
    secretHint: "Stored encrypted and never shown again. Paste it yourself — it goes nowhere except your own Supabase.",
  },
  {
    id: "github",
    name: "GitHub",
    blurb: "Push this project to a repository you own, for real version control outside the platform.",
    category: "Developer",
    status: "available",
    url: "https://github.com",
    mark: "GH",
    tint: "#24292f",
    fields: [
      { key: "repo", label: "Repository", placeholder: "your-name/your-repo" },
      { key: "branch", label: "Branch", placeholder: "main" },
    ],
    secretLabel: "Personal access token",
    secretHint: "Needs repo scope. Stored encrypted and never shown again.",
  },

  // ── Backend and data ─────────────────────────────────────
  { id: "cloud", name: "Cloud", blurb: "Built-in backend, ready to use — no account needed.", category: "Backend", status: "available", url: "", mark: "CL", tint: "#6366f1" },
  { id: "neon", name: "Neon", blurb: "Serverless Postgres with branching.", category: "Backend", status: "soon", url: "https://neon.tech", mark: "NE", tint: "#00e599" },
  { id: "planetscale", name: "PlanetScale", blurb: "Serverless MySQL platform.", category: "Backend", status: "soon", url: "https://planetscale.com", mark: "PS", tint: "#1a1a1a" },
  { id: "firebase", name: "Firebase", blurb: "Google's app platform — auth, Firestore, hosting.", category: "Google", status: "soon", url: "https://firebase.google.com", mark: "FB", tint: "#ffca28" },
  { id: "mongodb", name: "MongoDB Atlas", blurb: "Managed document database.", category: "Backend", status: "soon", url: "https://mongodb.com/atlas", mark: "MG", tint: "#00ed64" },
  { id: "redis", name: "Redis", blurb: "In-memory cache and key-value store.", category: "Backend", status: "soon", url: "https://redis.io", mark: "RD", tint: "#ff4438" },
  { id: "clickhouse", name: "ClickHouse", blurb: "Query ClickHouse databases over the HTTP interface.", category: "Analytics", status: "soon", url: "https://clickhouse.com", mark: "CH", tint: "#faff69" },
  { id: "airtable", name: "Airtable", blurb: "Read and write Airtable bases as a lightweight backend.", category: "Productivity", status: "soon", url: "https://airtable.com", mark: "AT", tint: "#fcb400" },
  { id: "dbt", name: "dbt Semantic Layer", blurb: "Query governed metrics from your dbt Semantic Layer.", category: "Analytics", status: "soon", url: "https://getdbt.com", mark: "DB", tint: "#ff694a" },
  { id: "snowflake", name: "Snowflake", blurb: "Query the Snowflake data warehouse.", category: "Analytics", status: "soon", url: "https://snowflake.com", mark: "SF", tint: "#29b5e8" },
  { id: "bigquery", name: "BigQuery", blurb: "Google's serverless data warehouse.", category: "Google", status: "soon", url: "https://cloud.google.com/bigquery", mark: "BQ", tint: "#4285f4" },

  // ── AI ───────────────────────────────────────────────────
  { id: "openai", name: "OpenAI", blurb: "Use OpenAI models inside your generated app.", category: "AI", status: "soon", url: "https://openai.com", mark: "OA", tint: "#10a37f" },
  { id: "anthropic", name: "Anthropic", blurb: "Use Claude models inside your generated app.", category: "AI", status: "soon", url: "https://anthropic.com", mark: "AN", tint: "#d97757" },
  { id: "gemini", name: "Google AI", blurb: "Use Gemini models inside your generated app.", category: "Google", status: "soon", url: "https://ai.google.dev", mark: "GA", tint: "#4285f4" },
  { id: "elevenlabs", name: "ElevenLabs", blurb: "Text to speech and voice cloning.", category: "AI", status: "soon", url: "https://elevenlabs.io", mark: "EL", tint: "#1a1a1a" },
  { id: "replicate", name: "Replicate", blurb: "Run open-source models by API.", category: "AI", status: "soon", url: "https://replicate.com", mark: "RP", tint: "#1a1a1a" },
  { id: "firecrawl", name: "Firecrawl", blurb: "AI-powered scraper, search and retrieval tool.", category: "AI", status: "soon", url: "https://firecrawl.dev", mark: "FC", tint: "#f97316" },
  { id: "perplexity", name: "Perplexity", blurb: "Search-grounded answers by API.", category: "AI", status: "soon", url: "https://perplexity.ai", mark: "PP", tint: "#20808d" },

  // ── Payments ─────────────────────────────────────────────
  { id: "stripe", name: "Stripe", blurb: "Set up payments, subscriptions and invoices.", category: "Payments", status: "soon", url: "https://stripe.com", mark: "ST", tint: "#635bff" },
  { id: "paddle", name: "Paddle", blurb: "Set up payments with tax handled for you.", category: "Payments", status: "soon", url: "https://paddle.com", mark: "PD", tint: "#ffdd00" },
  { id: "paypal", name: "PayPal", blurb: "Accept PayPal payments and read transactions.", category: "Payments", status: "soon", url: "https://paypal.com", mark: "PP", tint: "#003087" },
  { id: "square", name: "Square", blurb: "Point of sale, payments and inventory.", category: "Payments", status: "soon", url: "https://squareup.com", mark: "SQ", tint: "#1a1a1a" },
  { id: "lemonsqueezy", name: "Lemon Squeezy", blurb: "Merchant of record for digital products.", category: "Payments", status: "soon", url: "https://lemonsqueezy.com", mark: "LS", tint: "#ffc233" },

  // ── Ecommerce ────────────────────────────────────────────
  { id: "shopify", name: "Shopify", blurb: "Build an eCommerce store — products, orders, customers.", category: "Ecommerce", status: "soon", url: "https://shopify.com", mark: "SH", tint: "#95bf47" },
  { id: "woocommerce", name: "WooCommerce", blurb: "WordPress commerce store data.", category: "Ecommerce", status: "soon", url: "https://woocommerce.com", mark: "WC", tint: "#96588a" },
  { id: "bigcommerce", name: "BigCommerce", blurb: "Headless commerce catalogue and orders.", category: "Ecommerce", status: "soon", url: "https://bigcommerce.com", mark: "BC", tint: "#121118" },
  { id: "etsy", name: "Etsy", blurb: "Listings and orders from an Etsy shop.", category: "Ecommerce", status: "soon", url: "https://etsy.com", mark: "ET", tint: "#f56400" },
  { id: "ebay", name: "eBay", blurb: "Listings, orders and fulfilment.", category: "Ecommerce", status: "soon", url: "https://ebay.com", mark: "EB", tint: "#e53238" },
  { id: "printful", name: "Printful", blurb: "Print on demand fulfilment.", category: "Ecommerce", status: "soon", url: "https://printful.com", mark: "PF", tint: "#1a1a1a" },
  { id: "medusa", name: "Medusa", blurb: "Open-source commerce engine.", category: "Ecommerce", status: "soon", url: "https://medusajs.com", mark: "MD", tint: "#1a1a1a" },
  { id: "swell", name: "Swell", blurb: "Headless commerce API.", category: "Ecommerce", status: "soon", url: "https://swell.is", mark: "SW", tint: "#1a1a1a" },
  { id: "gumroad", name: "Gumroad", blurb: "Sell digital products and read sales.", category: "Ecommerce", status: "soon", url: "https://gumroad.com", mark: "GR", tint: "#ff90e8" },
  { id: "faire", name: "Faire", blurb: "Wholesale marketplace orders.", category: "Ecommerce", status: "soon", url: "https://faire.com", mark: "FA", tint: "#1a1a1a" },

  // ── Marketing ────────────────────────────────────────────
  { id: "resend", name: "Resend", blurb: "Email API for developers — transactional and marketing.", category: "Marketing", status: "soon", url: "https://resend.com", mark: "RS", tint: "#1a1a1a" },
  { id: "sendgrid", name: "SendGrid", blurb: "Transactional email at scale.", category: "Marketing", status: "soon", url: "https://sendgrid.com", mark: "SG", tint: "#1a82e2" },
  { id: "mailchimp", name: "Mailchimp", blurb: "Audiences, campaigns and automations.", category: "Marketing", status: "soon", url: "https://mailchimp.com", mark: "MC", tint: "#ffe01b" },
  { id: "klaviyo", name: "Klaviyo", blurb: "Ecommerce email and SMS marketing.", category: "Marketing", status: "soon", url: "https://klaviyo.com", mark: "KL", tint: "#1a1a1a" },
  { id: "postmark", name: "Postmark", blurb: "Fast transactional email delivery.", category: "Marketing", status: "soon", url: "https://postmarkapp.com", mark: "PM", tint: "#ffde00" },
  { id: "loops", name: "Loops", blurb: "Email for SaaS products.", category: "Marketing", status: "soon", url: "https://loops.so", mark: "LP", tint: "#1a1a1a" },
  { id: "customerio", name: "Customer.io", blurb: "Behavioural messaging and journeys.", category: "Marketing", status: "soon", url: "https://customer.io", mark: "CI", tint: "#7c3aed" },
  { id: "brevo", name: "Brevo", blurb: "Email, SMS and chat marketing.", category: "Marketing", status: "soon", url: "https://brevo.com", mark: "BR", tint: "#0b996e" },
  { id: "ahrefs", name: "Ahrefs", blurb: "SEO data — backlinks, keywords, rankings.", category: "Marketing", status: "soon", url: "https://ahrefs.com", mark: "AH", tint: "#054ada" },
  { id: "semrush", name: "Semrush", blurb: "Keyword and competitor research.", category: "Marketing", status: "soon", url: "https://semrush.com", mark: "SE", tint: "#ff642d" },
  { id: "similarweb", name: "Similarweb", blurb: "Traffic and audience intelligence.", category: "Marketing", status: "soon", url: "https://similarweb.com", mark: "SW", tint: "#092540" },
  { id: "buffer", name: "Buffer", blurb: "Schedule social posts across networks.", category: "Marketing", status: "soon", url: "https://buffer.com", mark: "BU", tint: "#2c4bff" },
  { id: "canva", name: "Canva", blurb: "Create and export designs.", category: "Marketing", status: "soon", url: "https://canva.com", mark: "CA", tint: "#00c4cc" },
  { id: "webflow", name: "Webflow", blurb: "CMS collections and site content.", category: "Marketing", status: "soon", url: "https://webflow.com", mark: "WF", tint: "#4353ff" },

  // ── Messaging ────────────────────────────────────────────
  { id: "slack", name: "Slack", blurb: "Send messages and interact with Slack workspaces.", category: "Messaging", status: "soon", url: "https://slack.com", mark: "SL", tint: "#4a154b" },
  { id: "discord", name: "Discord", blurb: "Bots, channels and messages.", category: "Messaging", status: "soon", url: "https://discord.com", mark: "DC", tint: "#5865f2" },
  { id: "twilio", name: "Twilio", blurb: "SMS, voice and WhatsApp messaging.", category: "Messaging", status: "soon", url: "https://twilio.com", mark: "TW", tint: "#f22f46" },
  { id: "telegram", name: "Telegram", blurb: "Bot messages and channel posts.", category: "Messaging", status: "soon", url: "https://telegram.org", mark: "TG", tint: "#26a5e4" },
  { id: "whatsapp", name: "WhatsApp Business", blurb: "Business messaging and templates.", category: "Messaging", status: "soon", url: "https://business.whatsapp.com", mark: "WA", tint: "#25d366" },
  { id: "teams", name: "Microsoft Teams", blurb: "Channels, chats and meetings.", category: "Microsoft", status: "soon", url: "https://microsoft.com/microsoft-teams", mark: "MT", tint: "#6264a7" },
  { id: "intercom", name: "Intercom", blurb: "Customer conversations and help centre.", category: "Messaging", status: "soon", url: "https://intercom.com", mark: "IC", tint: "#1f8ded" },
  { id: "zendesk", name: "Zendesk", blurb: "Support tickets and knowledge base.", category: "Messaging", status: "soon", url: "https://zendesk.com", mark: "ZD", tint: "#03363d" },

  // ── Productivity ─────────────────────────────────────────
  { id: "notion", name: "Notion", blurb: "Read and write Notion pages and databases.", category: "Productivity", status: "soon", url: "https://notion.so", mark: "NO", tint: "#1a1a1a" },
  { id: "linear", name: "Linear", blurb: "Issues, projects and cycles.", category: "Productivity", status: "soon", url: "https://linear.app", mark: "LI", tint: "#5e6ad2" },
  { id: "jira", name: "Jira", blurb: "Atlassian issue tracking.", category: "Productivity", status: "soon", url: "https://atlassian.com/software/jira", mark: "JR", tint: "#0052cc" },
  { id: "confluence", name: "Confluence", blurb: "Team documentation spaces.", category: "Productivity", status: "soon", url: "https://atlassian.com/software/confluence", mark: "CF", tint: "#0052cc" },
  { id: "asana", name: "Asana", blurb: "Tasks, projects and portfolios.", category: "Productivity", status: "soon", url: "https://asana.com", mark: "AS", tint: "#f06a6a" },
  { id: "trello", name: "Trello", blurb: "Boards, lists and cards.", category: "Productivity", status: "soon", url: "https://trello.com", mark: "TR", tint: "#0079bf" },
  { id: "clickup", name: "ClickUp", blurb: "Tasks, docs and goals.", category: "Productivity", status: "soon", url: "https://clickup.com", mark: "CU", tint: "#7b68ee" },
  { id: "monday", name: "monday.com", blurb: "Work boards and automations.", category: "Productivity", status: "soon", url: "https://monday.com", mark: "MO", tint: "#ff3d57" },
  { id: "todoist", name: "Todoist", blurb: "Tasks and projects.", category: "Productivity", status: "soon", url: "https://todoist.com", mark: "TD", tint: "#e44332" },
  { id: "calendly", name: "Calendly", blurb: "Scheduling links and booked events.", category: "Productivity", status: "soon", url: "https://calendly.com", mark: "CY", tint: "#006bff" },
  { id: "cal", name: "Cal.com", blurb: "Open-source scheduling.", category: "Productivity", status: "soon", url: "https://cal.com", mark: "CM", tint: "#1a1a1a" },
  { id: "dropbox", name: "Dropbox", blurb: "Files and shared folders.", category: "Productivity", status: "soon", url: "https://dropbox.com", mark: "DX", tint: "#0061ff" },
  { id: "box", name: "Box", blurb: "Enterprise content storage.", category: "Productivity", status: "soon", url: "https://box.com", mark: "BX", tint: "#0061d5" },
  { id: "figma", name: "Figma", blurb: "Files, frames and design tokens.", category: "Productivity", status: "soon", url: "https://figma.com", mark: "FG", tint: "#f24e1e" },
  { id: "miro", name: "Miro", blurb: "Boards and diagrams.", category: "Productivity", status: "soon", url: "https://miro.com", mark: "MI", tint: "#ffd02f" },
  { id: "airtable-forms", name: "Typeform", blurb: "Forms and survey responses.", category: "Productivity", status: "soon", url: "https://typeform.com", mark: "TF", tint: "#262627" },
  { id: "zapier", name: "Zapier", blurb: "Trigger automations across thousands of apps.", category: "Productivity", status: "soon", url: "https://zapier.com", mark: "ZP", tint: "#ff4f00" },
  { id: "n8n", name: "n8n", blurb: "Self-hostable workflow automation.", category: "Productivity", status: "soon", url: "https://n8n.io", mark: "N8", tint: "#ea4b71" },
  { id: "make", name: "Make", blurb: "Visual automation scenarios.", category: "Productivity", status: "soon", url: "https://make.com", mark: "MK", tint: "#6d00cc" },
  { id: "docusign", name: "DocuSign", blurb: "Send documents for e-signature.", category: "Productivity", status: "soon", url: "https://docusign.com", mark: "DS", tint: "#ffcc22" },
  { id: "contentful", name: "Contentful", blurb: "Headless CMS content.", category: "Productivity", status: "soon", url: "https://contentful.com", mark: "CT", tint: "#2478cc" },
  { id: "sanity", name: "Sanity", blurb: "Structured content platform.", category: "Productivity", status: "soon", url: "https://sanity.io", mark: "SN", tint: "#f03e2f" },
  { id: "strapi", name: "Strapi", blurb: "Open-source headless CMS.", category: "Productivity", status: "soon", url: "https://strapi.io", mark: "SP", tint: "#4945ff" },
  { id: "fireflies", name: "Fireflies", blurb: "Meeting transcripts and summaries.", category: "Productivity", status: "soon", url: "https://fireflies.ai", mark: "FF", tint: "#1a1a1a" },

  // ── Sales and CRM ────────────────────────────────────────
  { id: "hubspot", name: "HubSpot", blurb: "Contacts, companies, deals and tickets.", category: "Sales", status: "soon", url: "https://hubspot.com", mark: "HS", tint: "#ff7a59" },
  { id: "salesforce", name: "Salesforce", blurb: "Enterprise CRM objects and reports.", category: "Sales", status: "soon", url: "https://salesforce.com", mark: "SF", tint: "#00a1e0" },
  { id: "pipedrive", name: "Pipedrive", blurb: "Sales pipeline and activities.", category: "Sales", status: "soon", url: "https://pipedrive.com", mark: "PI", tint: "#017737" },
  { id: "attio", name: "Attio", blurb: "Flexible relationship CRM.", category: "Sales", status: "soon", url: "https://attio.com", mark: "AO", tint: "#1a1a1a" },
  { id: "apollo", name: "Apollo.io", blurb: "Search, enrich and engage B2B contacts and companies.", category: "Sales", status: "soon", url: "https://apollo.io", mark: "AP", tint: "#1a1a1a" },
  { id: "clay", name: "Clay", blurb: "Enrichment and go-to-market data.", category: "Sales", status: "soon", url: "https://clay.com", mark: "CY", tint: "#1a1a1a" },
  { id: "clearbit", name: "Clearbit", blurb: "Company and contact enrichment.", category: "Sales", status: "soon", url: "https://clearbit.com", mark: "CB", tint: "#3d80f5" },
  { id: "gong", name: "Gong", blurb: "Call recordings and revenue intelligence.", category: "Sales", status: "soon", url: "https://gong.io", mark: "GO", tint: "#a033ff" },
  { id: "outreach", name: "Outreach", blurb: "Sales engagement sequences.", category: "Sales", status: "soon", url: "https://outreach.io", mark: "OR", tint: "#5951ff" },
  { id: "close", name: "Close", blurb: "CRM built for calling.", category: "Sales", status: "soon", url: "https://close.com", mark: "CO", tint: "#1a1a1a" },
  { id: "quickbooks", name: "QuickBooks", blurb: "Invoices, expenses and reports.", category: "Sales", status: "soon", url: "https://quickbooks.intuit.com", mark: "QB", tint: "#2ca01c" },
  { id: "xero", name: "Xero", blurb: "Accounting, invoices and bank feeds.", category: "Sales", status: "soon", url: "https://xero.com", mark: "XR", tint: "#13b5ea" },

  // ── Google ───────────────────────────────────────────────
  { id: "gmail", name: "Gmail", blurb: "Read, send and manage your emails.", category: "Google", status: "soon", url: "https://gmail.com", mark: "GM", tint: "#ea4335" },
  { id: "gdrive", name: "Google Drive", blurb: "Upload and download files to and from Google Drive.", category: "Google", status: "soon", url: "https://drive.google.com", mark: "GD", tint: "#1fa463" },
  { id: "gsheets", name: "Google Sheets", blurb: "Read and write spreadsheet data.", category: "Google", status: "soon", url: "https://sheets.google.com", mark: "GS", tint: "#0f9d58" },
  { id: "gdocs", name: "Google Docs", blurb: "Create and edit documents.", category: "Google", status: "soon", url: "https://docs.google.com", mark: "GO", tint: "#4285f4" },
  { id: "gcal", name: "Google Calendar", blurb: "Events, availability and scheduling.", category: "Google", status: "soon", url: "https://calendar.google.com", mark: "GC", tint: "#4285f4" },
  { id: "gmaps", name: "Google Maps Platform", blurb: "Maps, geocoding, directions and places APIs.", category: "Google", status: "soon", url: "https://mapsplatform.google.com", mark: "MP", tint: "#34a853" },
  { id: "ganalytics", name: "Google Analytics", blurb: "Traffic, events and conversions.", category: "Google", status: "soon", url: "https://analytics.google.com", mark: "GA", tint: "#e37400" },
  { id: "gads", name: "Google Ads", blurb: "Campaigns, keywords and spend.", category: "Google", status: "soon", url: "https://ads.google.com", mark: "AD", tint: "#4285f4" },

  // ── Microsoft ────────────────────────────────────────────
  { id: "outlook", name: "Outlook", blurb: "Mail, calendar and contacts.", category: "Microsoft", status: "soon", url: "https://outlook.com", mark: "OL", tint: "#0078d4" },
  { id: "onedrive", name: "OneDrive", blurb: "Files and shared documents.", category: "Microsoft", status: "soon", url: "https://onedrive.com", mark: "OD", tint: "#0078d4" },
  { id: "excel", name: "Excel", blurb: "Workbooks, sheets and ranges.", category: "Microsoft", status: "soon", url: "https://microsoft.com/microsoft-365/excel", mark: "XL", tint: "#217346" },
  { id: "sharepoint", name: "SharePoint", blurb: "Sites, lists and libraries.", category: "Microsoft", status: "soon", url: "https://microsoft.com/microsoft-365/sharepoint", mark: "SP", tint: "#038387" },
  { id: "dynamics", name: "Dynamics 365", blurb: "Microsoft CRM and ERP records.", category: "Microsoft", status: "soon", url: "https://microsoft.com/dynamics-365", mark: "D3", tint: "#002050" },
  { id: "azure-openai", name: "Azure OpenAI", blurb: "OpenAI models on Azure.", category: "Microsoft", status: "soon", url: "https://azure.microsoft.com/products/ai-services/openai-service", mark: "AZ", tint: "#0078d4" },
  { id: "powerbi", name: "Power BI", blurb: "Datasets, reports and dashboards.", category: "Microsoft", status: "soon", url: "https://powerbi.microsoft.com", mark: "PB", tint: "#f2c811" },

  // ── AWS ──────────────────────────────────────────────────
  { id: "s3", name: "Amazon S3", blurb: "Object storage for files and media.", category: "AWS", status: "soon", url: "https://aws.amazon.com/s3", mark: "S3", tint: "#569a31" },
  { id: "ses", name: "Amazon SES", blurb: "Bulk and transactional email sending.", category: "AWS", status: "soon", url: "https://aws.amazon.com/ses", mark: "SE", tint: "#ff9900" },

  // ── Developer ────────────────────────────────────────────
  { id: "gitlab", name: "GitLab", blurb: "Repositories, issues and pipelines.", category: "Developer", status: "soon", url: "https://gitlab.com", mark: "GL", tint: "#fc6d26" },
  { id: "vercel", name: "Vercel", blurb: "Deployments, domains and environment variables.", category: "Developer", status: "soon", url: "https://vercel.com", mark: "VC", tint: "#1a1a1a" },
  { id: "netlify", name: "Netlify", blurb: "Deploy the built site to Netlify.", category: "Developer", status: "available", url: "https://netlify.com", mark: "NL", tint: "#00c7b7" },
  { id: "cloudflare", name: "Cloudflare", blurb: "Pages, Workers, DNS and R2.", category: "Developer", status: "soon", url: "https://cloudflare.com", mark: "CF", tint: "#f38020" },
  { id: "sentry", name: "Sentry", blurb: "Error tracking for the generated app.", category: "Developer", status: "soon", url: "https://sentry.io", mark: "SY", tint: "#362d59" },
  { id: "posthog", name: "PostHog", blurb: "Product analytics and session replay.", category: "Analytics", status: "soon", url: "https://posthog.com", mark: "PH", tint: "#f54e00" },
  { id: "amplitude", name: "Amplitude", blurb: "Product analytics and cohorts.", category: "Analytics", status: "soon", url: "https://amplitude.com", mark: "AM", tint: "#1f6fff" },
  { id: "mixpanel", name: "Mixpanel", blurb: "Events, funnels and retention.", category: "Analytics", status: "soon", url: "https://mixpanel.com", mark: "MX", tint: "#7856ff" },
  { id: "datadog", name: "Datadog", blurb: "Metrics, traces and monitors.", category: "Developer", status: "soon", url: "https://datadoghq.com", mark: "DD", tint: "#632ca6" },
  { id: "pagerduty", name: "PagerDuty", blurb: "On-call schedules and incidents.", category: "Developer", status: "soon", url: "https://pagerduty.com", mark: "PG", tint: "#06ac38" },
  { id: "auth0", name: "Auth0", blurb: "Hosted authentication and user management.", category: "Developer", status: "soon", url: "https://auth0.com", mark: "A0", tint: "#eb5424" },
  { id: "clerk", name: "Clerk", blurb: "Drop-in auth and user profiles.", category: "Developer", status: "soon", url: "https://clerk.com", mark: "CK", tint: "#6c47ff" },
  { id: "algolia", name: "Algolia", blurb: "Hosted search and instant results.", category: "Developer", status: "soon", url: "https://algolia.com", mark: "AL", tint: "#003dff" },
  { id: "uploadthing", name: "UploadThing", blurb: "File uploads without the plumbing.", category: "Developer", status: "soon", url: "https://uploadthing.com", mark: "UT", tint: "#e91e63" },
  { id: "cloudinary", name: "Cloudinary", blurb: "Image and video hosting and transforms.", category: "Developer", status: "soon", url: "https://cloudinary.com", mark: "CD", tint: "#3448c5" },
  { id: "mapbox", name: "Mapbox", blurb: "Maps, geocoding and navigation.", category: "Developer", status: "soon", url: "https://mapbox.com", mark: "MB", tint: "#4264fb" },
];

export const CATEGORIES: ConnectorCategory[] = [
  "Backend", "AI", "Payments", "Ecommerce", "Marketing", "Messaging",
  "Productivity", "Sales", "Analytics", "Developer", "Google", "Microsoft", "AWS",
];

export function connector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function availableConnectors(): Connector[] {
  return CONNECTORS.filter((c) => c.status === "available");
}

export function countsByCategory(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of CONNECTORS) out[c.category] = (out[c.category] ?? 0) + 1;
  return out;
}
