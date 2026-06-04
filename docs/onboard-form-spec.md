# PUMPTANK founder opt-in — Tally form spec

The form is the **intake + verification** step. It does NOT itself authorize anything:
a human verifies the claim, then makes the one-time pump.fun fee-share change. Two
things matter most because they involve real money:
1. **Proving the submitter is the real founder** (stop impostors claiming someone
   else's 80%).
2. **Getting the Solana wallet exactly right** (the pump.fun fee-share change is a
   one-time, then-locked action — a typo'd address is unrecoverable).

Voice: dry, editorial, reassuring. Free, ~2 minutes, no purchase, opt out anytime.

---

## Title & intro (first block)
**Title:** `Founder Verification · Form 80/20`
(In the embed the page already shows "Tell us who you are," so you can hide Tally's
title or keep it small.)

**Intro text:**
> You pitched it. You didn't get the deal. If you founded one of the companies in the
> PUMPTANK archive, this form starts your claim to **80% of your tribute token's
> creator fees**. It's free, there's nothing to buy, and you can opt out anytime.
> We verify every claim by hand before anything changes on-chain. Takes about 2 minutes.

---

## Fields

### A · Which pitch
1. **Company / product name** — Short answer · required
   Help: "The Shark Tank pitch you founded." *(Prefilled via hidden field when they
   arrive from a token page — see Setup.)*
2. **Token ticker** — Short answer · optional
   Help: "If you know it, e.g. $SKYRIDE. Leave blank if unsure."

### B · You
3. **Your full name** — Short answer · required
   Help: "As it appears publicly / on the record."
4. **Your role** — Multiple choice · required
   Options: Founder · Co-founder · Authorized representative · Other
   → *Conditional:* if **Authorized representative** or **Other**, show
   **"Your relationship and authority to claim on the founder's behalf"** — Long answer · required.
5. **Email** — Email block · required
   Help: "Where we'll reach you to confirm. A company-domain email (you@yourcompany.com)
   helps us verify faster."
6. **Best handle to reach you (X / Telegram)** — Short answer · optional

### C · Verification (the important part)
7. **How can we confirm you're the real founder?** — Long answer · required
   Help: "Link anything that ties your name to this pitch — LinkedIn, the company's
   official site or socials, press, the episode. The more, the faster."
8. **Proof link** — URL/Short answer · required (add a 2nd/3rd optional)
   Placeholder: "https://linkedin.com/in/…"
9. **Identity challenge acknowledgment** — Checkbox · required
   Label: "I understand that to prevent impersonation, PUMPTANK will ask me to prove
   control of an official channel before any fees are routed — e.g. reply from my
   company-domain email, or post a one-time code from the company's/founder's verified
   account."

### D · Where the fees go
10. **Your Solana wallet address** — Short answer · required
    Help (make it loud): "⚠ This is where your 80% share is routed. On pump.fun the
    fee-share recipient can be set only once and is then locked, so accuracy is
    critical. We will read this back to you and confirm before making any change.
    Paste it — don't type it."
    Placeholder: "e.g. 7xKX…aBcD (Solana, base58, ~32–44 chars)"
    Validation (if available): regex `^[1-9A-HJ-NP-Za-km-z]{32,44}$`
11. **Re-enter wallet address** — Short answer · required
    Help: "Paste it again. Mismatches are the #1 way money goes to the wrong place."
    *(If your Tally plan can't compare two fields, replace with a checkbox: "I have
    triple-checked this address and it is correct and under my control.")*

### E · Acknowledgments — Checkboxes · all required
- ☐ I am the founder or an authorized representative of this company.
- ☐ I understand PUMPTANK is an **unofficial fan tribute / parody**, not affiliated with
  or endorsed by me, the company, Shark Tank, ABC, or Sony.
- ☐ I understand this is **not an investment**, there is no payment to participate, the
  token was not created or funded by me, creator fees are **variable and not guaranteed**,
  and nothing here is financial advice.
- ☐ I understand I can **opt out at any time**.
- ☐ I consent to PUMPTANK contacting me and storing what I submit for verification.

### F · Optional
12. **Anything you'd want buyers to know?** — Long answer · optional
    Help: "Want the original story told right? This is your mic."

**Submit button:** `Submit for verification`

---

## Confirmation / thank-you screen
> **Claim received.** We'll verify it's really you and email you at the address you gave,
> usually within a few days. Nothing changes on-chain until we've confirmed your identity
> and double-checked your wallet with you directly. No deal on TV — second life on-chain.
> Questions? Reach us at **<your contact email / @handle>**.

---

## Tally setup notes
- **Hidden fields** (Tally → field → "Hidden field", value from URL query): add
  `company`, `ticker`, `token_id`. The site can deep-link each token's "Opt in" button
  to `…/onboard/?company=<name>&ticker=<sym>&token_id=<id>` and the embed forwards them,
  so the founder doesn't have to figure out which token is theirs and you get a clean
  record key. (Ask me to wire this — it's a small site change.)
- **Notifications:** turn on email-on-submission; ideally also a Slack/webhook or a
  Google Sheet / Notion integration so claims land in a tracker.
- **Status tracking:** add a column to that sheet matching the fee-routing runbook:
  `received → verified → wallet-confirmed → redirected (80/20)`.
- **Spam:** enable the reCAPTCHA / anti-spam toggle.
- **Required + validation:** mark all the above "required" ones; email block validates
  format; apply the wallet regex if your plan supports input validation.
- **Privacy:** the form collects PII (name, email, wallet). Keep the consent checkbox;
  link your privacy note if you have one.
- **Publish**, copy the form URL, then replace `FORM_URL` in
  `web/app/onboard/page.tsx` (currently `https://tally.so/r/REPLACE_ME`).

## What I can do in code
1. Swap in the real `FORM_URL` once you publish.
2. Wire the hidden-field deep-link (pass `company`/`ticker`/`token_id` from each token
   page's "Opt in" button → the embedded form), so claims arrive pre-tagged.
