#!/usr/bin/env node
/* Create the PUMPTANK founder opt-in form in Tally via the API.
 *
 * Usage:  TALLY_API_KEY=tly_xxx node scripts/create-tally-form.mjs
 *         (optional)  TALLY_WORKSPACE_ID=ws_xxx  TALLY_STATUS=PUBLISHED
 *
 * Get a key: Tally → Settings → API keys → create personal access token.
 * Creates as DRAFT by default so you can eyeball it in Tally before publishing.
 * Prints the new form id + edit/share URLs on success; prints the API error body
 * on failure (the block schema can need a tweak — paste me the error and I'll fix).
 */
import { randomUUID } from "node:crypto";

const API_KEY = process.env.TALLY_API_KEY;
if (!API_KEY) {
  console.error("Missing TALLY_API_KEY env var. Get one at Tally → Settings → API keys.");
  process.exit(1);
}
const STATUS = process.env.TALLY_STATUS || "DRAFT"; // DRAFT | PUBLISHED
const WORKSPACE_ID = process.env.TALLY_WORKSPACE_ID || undefined;

const blocks = [];
const push = (type, payload, groupUuid, groupType) => {
  const uuid = randomUUID();
  blocks.push({ uuid, type, groupUuid: groupUuid || uuid, groupType: groupType || type, payload });
  return uuid;
};

// --- layout helpers ---
const formTitle = (html) => push("FORM_TITLE", { html });
const heading = (html) => push("HEADING_2", { html });
const text = (html) => push("TEXT", { html });
const divider = () => push("DIVIDER", {});

// --- question helpers: a TITLE label block (its own group) followed by the input
//     block. Tally rules: the input's groupType must equal its own type, its payload
//     must NOT carry html, and the label must be a separate Title/Label block. ---
const label = (html) => push("TITLE", { html }); // own uuid as group, groupType "TITLE"
const input = (type, html, opts = {}) => {
  label(html);
  push(type, { isRequired: !!opts.required, placeholder: opts.placeholder, name: opts.name }); // groupType defaults to type
};
const short = (html, o) => input("INPUT_TEXT", html, o);
const email = (html, o) => input("INPUT_EMAIL", html, o);
const link = (html, o) => input("INPUT_LINK", html, o);
const phone = (html, o) => input("INPUT_PHONE_NUMBER", html, o);
const long = (html, o) => input("TEXTAREA", html, o);

// multiple choice: a question-label block (its OWN group — Tally requires Title/Label
// blocks to not share a groupUuid with inputs) + option blocks sharing one group.
const choice = (html, options, opts = {}) => {
  const titleUuid = randomUUID();
  blocks.push({ uuid: titleUuid, type: "TITLE", groupUuid: titleUuid, groupType: "TITLE", payload: { html } });
  const g = randomUUID();
  options.forEach((text, i) =>
    blocks.push({
      uuid: randomUUID(), type: "MULTIPLE_CHOICE_OPTION", groupUuid: g, groupType: "MULTIPLE_CHOICE",
      payload: { index: i, isFirst: i === 0, isLast: i === options.length - 1, text,
        allowMultiple: false, isRequired: !!opts.required, name: opts.name },
    })
  );
};

// single required consent checkbox (CHECKBOXES container + one CHECKBOX child)
const consent = (html) => {
  const g = randomUUID();
  blocks.push({ uuid: g, type: "CHECKBOX", groupUuid: g, groupType: "CHECKBOXES",
    payload: { index: 0, isFirst: true, isLast: true, text: html, isRequired: true, hasMinChoices: true, minChoices: 1 } });
};

// ===================== THE FORM =====================
formTitle("<h1>Founder Verification · Form 80/20</h1>");
text(
  "<p>You pitched it. You didn't get the deal. If you founded one of the companies in the " +
  "PUMPTANK archive, this starts your claim to <b>80% of your tribute token's creator fees</b>. " +
  "It's free, there's nothing to buy, and you can opt out anytime. We verify every claim by hand " +
  "before anything changes on-chain. About 2 minutes.</p>"
);

// hidden fields populated from the embed URL (?company=&ticker=&token_id=)
push("HIDDEN_FIELDS", { hiddenFields: [
  { uuid: randomUUID(), name: "company" },
  { uuid: randomUUID(), name: "ticker" },
  { uuid: randomUUID(), name: "token_id" },
] });

heading("<h2>Which pitch</h2>");
short("<p>Company / product name</p>", { required: true, name: "company_name", placeholder: "The Shark Tank pitch you founded" });
short("<p>Token ticker (optional)</p>", { name: "ticker_input", placeholder: "If you know it, e.g. $SKYRIDE" });

heading("<h2>You</h2>");
short("<p>Your full name</p>", { required: true, name: "full_name", placeholder: "As it appears publicly" });
choice("<p>Your role</p>", ["Founder", "Co-founder", "Authorized representative", "Other"], { required: true, name: "role" });
long("<p>If you're a representative or 'other', describe your relationship and authority to claim on the founder's behalf</p>", { name: "authority" });
email("<p>Email</p>", { required: true, name: "email", placeholder: "A company-domain email helps us verify faster" });
short("<p>Best handle to reach you — X / Telegram (optional)</p>", { name: "handle" });

heading("<h2>Verification</h2>");
long("<p>How can we confirm you're the real founder?</p>", { required: true, name: "verify_how", placeholder: "Link LinkedIn, the company's official site/socials, press, the episode…" });
link("<p>Proof link</p>", { required: true, name: "proof_1", placeholder: "https://linkedin.com/in/…" });
link("<p>Another proof link (optional)</p>", { name: "proof_2" });
consent("To prevent impersonation, I understand PUMPTANK will ask me to prove control of an official channel before any fees are routed (e.g. reply from my company-domain email, or post a one-time code from the company's verified account).");

heading("<h2>Where the fees go</h2>");
short("<p>Your Solana wallet address ⚠ paste, don't type</p>", { required: true, name: "wallet", placeholder: "e.g. 7xKX…aBcD (base58, ~32–44 chars)" });
text("<p>This is where your 80% share is routed. On pump.fun the recipient can be set only once and is then locked, so accuracy is critical. We'll read it back to you and confirm before any change.</p>");
short("<p>Re-enter your wallet address</p>", { required: true, name: "wallet_confirm", placeholder: "Paste it again — mismatches send money to the wrong place" });

heading("<h2>Acknowledgments</h2>");
consent("I am the founder or an authorized representative of this company.");
consent("I understand PUMPTANK is an unofficial fan tribute / parody, not affiliated with or endorsed by me, the company, Shark Tank, ABC, or Sony.");
consent("I understand this is not an investment, there's no payment to participate, the token was not created or funded by me, creator fees are variable and not guaranteed, and nothing here is financial advice.");
consent("I understand I can opt out at any time.");
consent("I consent to PUMPTANK contacting me and storing what I submit for verification.");

heading("<h2>Anything else</h2>");
long("<p>Anything you'd want buyers to know? (optional)</p>", { name: "note", placeholder: "Want the original story told right? This is your mic." });

// thank-you page
push("PAGE_BREAK", { isThankYouPage: true });
text(
  "<p><b>Claim received.</b> We'll verify it's really you and email you, usually within a few days. " +
  "Nothing changes on-chain until we've confirmed your identity and double-checked your wallet with " +
  "you directly. No deal on TV — second life on-chain.</p>"
);

// ===================== CREATE =====================
const body = { status: STATUS, blocks };
if (WORKSPACE_ID) body.workspaceId = WORKSPACE_ID;

const res = await fetch("https://api.tally.so/forms", {
  method: "POST",
  headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const out = await res.text();
if (!res.ok) {
  console.error(`✗ Tally API ${res.status}:\n${out}`);
  process.exit(1);
}
const form = JSON.parse(out);
console.log(`✓ Created form "${form.name ?? "(untitled)"}" — id: ${form.id}, status: ${form.status ?? STATUS}`);
console.log(`  Edit:  https://tally.so/forms/${form.id}/edit`);
console.log(`  Share: https://tally.so/r/${form.id}`);
console.log(`\nNext: paste the share URL into FORM_URL in web/app/onboard/page.tsx.`);
