# Autonomous AP — Invoice Agent Prototype

A working prototype of an AI invoice-processing agent modeled on AppZen's Autonomous AP
product: extraction, GL coding, entity allocation, and line-item (3-way match) validation,
with every step narrated in plain language — not a spinner, not a black box.

## Run it locally

```
npm install
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173`).

## What it does

- **Invoice queue** of 7 synthetic invoices. Click **Process next invoice** (or **Run all
  remaining**) and watch the agent work through each one live.
- For every invoice, the agent reveals its reasoning **step by step**: field extraction,
  vendor matching, GL code assignment, entity/cost-center allocation, 3-way match against
  the PO, and a duplicate/fraud check — each with the specific evidence it used (invoice
  numbers, historical coding percentages, confidence scores) instead of a generic
  "processing" state.
- The agent **auto-posts** invoices that clear every check, or **flags** them with the
  exact reason when something doesn't clear its threshold — a first-time vendor with no
  coding history, a quantity that exceeds the PO beyond tolerance, or a probable duplicate
  submission.
- **The reasoning trail is retained, not ephemeral.** Every processed invoice sits in a
  history list — click any row later to re-open its full trail exactly as it was decided,
  the same way an AP specialist or external auditor would need to.
- Live stats: touchless rate, dollars auto-posted, and invoices flagged for review.

This is a direct response to a real, named gap: AppZen's own customers rank "AI
explainability — transparent audit trails that show exactly why an agent flagged or
approved spend" as a top area they want improved. This prototype treats that as the
product, not an add-on.

## What's real vs. assumed

| Item | Status |
|---|---|
| Decision logic (what triggers auto-post vs. a flag, and why) | Real logic — mirrors how an explainable AP agent evaluates extraction confidence, vendor match, GL-code history, PO tolerance, and duplicate detection |
| Vendors, invoice/PO numbers, GL codes, entities | Invented for the demo (generic B2B suppliers, synthetic entity/cost-center structure) |
| Dollar amounts, historical coding percentages, confidence scores | Randomly scripted per invoice for illustration — not from any live ledger, ERP, or trained model |
| "Posted to ERP" | Simulated status only — no live connection to SAP, Oracle, Workday, or NetSuite |
| OCR / document field extraction | Scripted narration of what a document-parsing model would report, not a real OCR/LLM call against these PDFs |
| Duplicate/fraud detection | Illustrative scripted pattern, not a trained fraud-detection model |
| Vision & requirements content (architecture, non-goals, open questions, phasing) | Product framing for this prototype, drawn from AppZen's published Autonomous AP capabilities and customer feedback themes — not a finalized AppZen spec |

## Stack

Single-page React app (Vite), Tailwind for styling, lucide-react for icons. Everything
lives in [`src/App.jsx`](src/App.jsx).
