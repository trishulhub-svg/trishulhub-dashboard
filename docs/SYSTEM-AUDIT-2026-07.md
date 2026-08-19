# Trishulhub Technology — Full System Audit

**Product:** Internal OS + client portal for Trishulhub Technology (custom software, web, mobile)  
**Domain:** trishulhub.com / `trishulhub-dashboard`  
**Audit date:** 2026-07-17  
**Method:** Full codebase inventory (routes, APIs, Prisma, RBAC, HOLD leftovers) + business lens for an agency OS.  
**Live UI pass:** Pending — paste SUPER_ADMIN email/password when ready (used once for browsing; not stored or reprinted).

---

## 0. Executive summary (owner view)

You already have a **working agency operating system**: role-gated staff dashboard, client portal, CRM kanban, delivery projects with encrypted credentials, finance (invoices/expenses/subscriptions), people (leave, availability, KYC), learning QR, vault, and audit trail.

What is *not* yet a “highly advanced” agency OS is the **business spine**:

1. **Money integrity** (currency, float amounts, delete cascades wiping invoices)  
2. **Delivery profitability** (budget vs time vs billed — missing)  
3. **CRM completeness** (Deal/Contact models exist; no real CRUD)  
4. **Client experience** (portal is thin; support has no staff inbox in nav)  
5. **Code maintainability** (several 1.5k–3k line page monoliths)

**Verdict:** Strong **v1 internal tool**. Next leap = **accounting-safe + project P&L + real client portal + CRM deals**, not more decorative UI.

---

## 1. What you are building (business map)

| Your real work | What the system should do | Current coverage |
|---|---|---|
| Sell custom software / web / apps | Lead → deal → proposal → win → client | Lead kanban **yes**; Deal/proposal/SOW **weak/missing** |
| Deliver projects | Scope, milestones, team, status, demos | Projects + demo board **yes**; tasks/milestones **no** |
| Bill clients | Quotes, milestones, retainers, invoices, GST | Invoices **yes**; retainers/milestones/partial pay **no** |
| Control cost | Tools, hosting, salary, project cost | Expenses + subscriptions **yes**; project P&L **no** |
| Run people | Leave, availability, payroll basics | Leave/availability/KYC **yes**; balances/payroll **no** |
| Secure ops | Credentials, API keys, audit | Access Hub + vault + audit **yes** (vault encrypt fallback risk) |
| Client transparency | Progress, invoices, tickets, files | Portal **basic** |

---

## 2. Role map (who sees what)

| Role | Staff app | Notes |
|---|---|---|
| SUPER_ADMIN | Everything + Email Logs + SMTP | Top ops |
| ADMIN | Finance, CRM, Team, Audit, API Keys, Training assign | Day-to-day owner |
| PROJECT_MANAGER | Projects, Clients, Demo, Approvals, Availability (read), Time, Access Hub | **No finance / CRM / team nav** |
| DEVELOPER | Dashboard, Workspace, Learning, Time, Leaves, My Details, Access Hub | Assigned projects only |
| VIEWER | Almost no nav | Policy leftover — can still hit some APIs |
| CLIENT | `/portal` only | Projects, invoices, support |

---

## 3. Full page inventory + APIs + health

### 3.1 Overview

| Page | Path | Main APIs | Working? | Improve |
|---|---|---|---|---|
| Dashboard | `/dashboard` | `/api/dashboard`, `/api/earnings` | Yes — role-aware | Revenue tile density on mobile; add “pipeline value” + “at-risk delivery” for agency owners |
| Workspace | `/dashboard/workspace` | `/api/workspace/live-ops`, time-tracking | Partially — live clock-in useful | **Fake AGENT/PROTOCOL feed** is noise; simplify to real ops only (live users, projects, clock) |
| Learning gate | `/dashboard/training` | prefs redirect | Yes | Fine as router |

### 3.2 Work

| Page | Path | Main APIs | Working? | Improve |
|---|---|---|---|---|
| Projects | `/dashboard/projects` | `/api/projects`, methods, credentials | Yes — kanban + CRUD | Delete copy mentions “tasks” but **no Task model**; **hard delete cascades invoices/time** — dangerous |
| Project detail | `/dashboard/projects/[id]` | members, websites, infra, credentials | Yes — strong for delivery shop | Add milestones, budget vs billed, files |
| Demo Projects | `/dashboard/demo` | same projects API `isDemo` | Yes | Keep; add “convert demo → production client project” |
| Clients | `/dashboard/clients` | `/api/clients`, contracts | Yes — rich client sheet | Soft-deactivate good; **permanent delete wipes invoices**; Deal/Contact tabs mostly empty |
| CRM | `/dashboard/crm` | `/api/leads`, emails | Yes — kanban | Add Deal pipeline, forecast, proposal PDF |
| Time Tracking | `/dashboard/time-tracking` | `/api/time-tracking*` | Yes | Billable flag, rates, utilization report; Attendance vs TimeEntry dual model |

### 3.3 People

| Page | Path | Main APIs | Working? | Improve |
|---|---|---|---|---|
| Leaves | `/dashboard/leaves` | `/api/leaves` | Yes (recent speed fix) | Leave **balances**, holiday calendar, policy rules |
| My Details | `/dashboard/my-details` | `/api/user-details` | Yes — encrypted KYC | Faster for admins already; add export for payroll |
| Team | `/dashboard/team` | `/api/team` | Yes | Soft-deactivate users; manager hierarchy; 100-user cap |
| Availability | `/dashboard/availability` | availability* APIs | Yes — very complete | **UX overload** (3 schedule layers); mobile simplify |
| Approvals | `/dashboard/approvals` | `/api/approvals` | Yes | Unify leave/expense/AI-era types; remove dead “agent” cosmetics |

### 3.4 Finance

| Page | Path | Main APIs | Working? | Improve |
|---|---|---|---|---|
| Finance hub | `/dashboard/finance` | dashboard/stats, subscriptions, expenses/stats | Yes | Overlaps dedicated invoice/expense pages; currency chaos |
| Invoices | `/dashboard/finance/invoices` | `/api/invoices`, send | Yes | **No invoice.currency**; no partial payments; PDF/payment link |
| Expenses | `/dashboard/finance/expenses` | expenses, expense-categories | Yes | No expense.currency; categories now editable |
| Subscriptions | (tab on hub) | `/api/subscriptions` | Yes | Status vocabulary drift (PAUSED vs schema) |
| Earnings | (dashboard strip) | `/api/earnings` | Yes | Salary-as-expense shortcut ≠ payroll |

### 3.5 Learning

| Page | Path | Main APIs | Working? | Improve |
|---|---|---|---|---|
| My Training | `/dashboard/training/my` | assignments | Yes | Self-mark complete (trust); no evidence |
| QR | `/dashboard/training/qr` | training/qr | Yes | Base64 image in DB is heavy; treat as shared secret |
| Assign | `/dashboard/training/assign` | assignments | Yes | Skills matrix / Percipio sync later |

### 3.6 System

| Page | Path | Main APIs | Working? | Improve |
|---|---|---|---|---|
| Access Hub | `/dashboard/access-hub` | `/api/credentials` | Yes | PM sees all users — high privilege; rotation reminders |
| API Keys | `/dashboard/api-keys` | vault-secrets | Yes | **Encrypt fallback to plaintext if key missing** — P0 |
| Audit Trail | `/dashboard/audit-trail` | audit-trail* | Yes | Export good; taxonomy still mentions “tasks” |
| Email Logs | `/dashboard/email-logs` | email-logs | Yes (SA) | Keep |
| Settings | `/dashboard/settings` | password/email change, SMTP, prefs | Yes | Notification toggles not all wired |

### 3.7 Client portal

| Page | Path | Main APIs | Working? | Improve |
|---|---|---|---|---|
| Portal home | `/portal` | projects, invoices (limit 20) | Thin | Stats undercount; ₹ hardcoded |
| Projects | `/portal/projects` | projects | Basic | Milestones, files, status narrative |
| Invoices | `/portal/invoices` | invoices | Basic | PDF download, pay link |
| Support | `/portal/support` | support | Client side yes | **No staff Support inbox in dashboard nav** |

---

## 4. What is already strong (keep / polish)

1. **RBAC scaffolding** — middleware + `lib/rbac` + per-route checks (better than most early products).  
2. **Client soft-deactivate (`CHURNED`)** before hard wipe.  
3. **Encrypted credentials / UserDetail PII** (AES patterns + masked lists).  
4. **Invoice math validation** (subtotal + tax + GST).  
5. **Audit on sensitive reads** (earnings, vault reveal).  
6. **Portal CLIENT isolation** (forced away from staff app).  
7. **Kanban patterns** reused (CRM, projects) with collision helpers.  
8. **Ponytail helpers** already in tree (`useUrlState`, `CollapsibleStatStrip`).  
9. **Honest HOLD list** in `docs/HOLD-LEFTOVERS.md` — rare and valuable.

---

## 5. Visual / frontend quality (whole UI)

### Working well
- Consistent shell (sidebar groups: Overview / Work / People / Finance / System).  
- Recent mobile work: zoom lock, leaves speed, dashboard overflow, finance collapsible stats.  
- shadcn + Tailwind gives a coherent control-panel look.

### Needs improvement (system-wide)

| Issue | Where | Recommendation |
|---|---|---|
| **Page monoliths** | availability ~3k, projects ~2.2k, workspace ~2.1k, clients ~2k | Split into route segments + `_components/` |
| **Card / glass soup** | Finance hub, CRM, Expenses cards | One job per section; reduce nested cards |
| **Theatrical Workspace** | fake feed / protocol lines | Strip to real live-ops only |
| **Inconsistent density** | Portal vs staff app | Shared design tokens; same type scale |
| **Empty-state quality** | uneven | Every list: one CTA + one sentence |
| **Mobile tables** | leaves/team/invoices | Card rows on &lt;640px (partially done) |
| **Brand vs utility** | staff app is tool-first (OK) | Portal should feel more “client brand” |
| **Purple/cyan AI aesthetic** | Workspace stats | Align with Trishulhub teal brand, not generic AI purple |

**Design north star for “advanced”:** fewer screens that do more *business jobs* (P&L, pipeline, client status) — not more gradients.

---

## 6. Codebase health

### Organized
- Clear `src/app/api/*` modules per domain  
- Shared `lib/{auth,rbac,db,encryption,audit-log,rate-limit}`  
- Auto-migrate for Turso reality  

### Not perfect
| Problem | Impact | Fix direction |
|---|---|---|
| String statuses instead of Prisma enums | Silent bad data | Enums + migration |
| Float money | Rounding errors | Decimal / integer paise |
| Dual systems (Attendance/TimeEntry, Leave/date-ranges) | Confusion | One source of truth |
| Deal/Contact without APIs | Dead UI tabs | Build or hide |
| Orphan Turso tables (Agent*, Task*, …) | DB clutter | Controlled drop after backup |
| VIEWER / audit RBAC drift | Security ambiguity | Decide + enforce |
| `deepSanitize` name ≠ XSS sanitize | False confidence | Rename + real HTML policy |
| CSP Report-Only | Weaker XSS defense | Enforce when ready |

---

## 7. Finance deep dive (agency-critical)

### Perfect enough today
- Admin-only finance  
- Invoices create/edit/send  
- Expenses + categories  
- Subscriptions with FX awareness  
- Hub overview charts  

### Broken / risky now
1. **Invoice has no `currency` field** — Deal defaults USD, Subscription INR, UI often ₹, some audit strings £.  
2. **Expense has no currency**.  
3. **`onDelete: Cascade` from Project → Invoice/Expense/TimeEntry** — deleting a delivery project can erase accounting history.  
4. **Hard delete invoices** — no void/credit note.  
5. **No Payment model** — cannot track partial payments cleanly.  
6. **“Net profit”** ≈ revenue − expenses − subs — **not** project profitability.

### Future problems if you grow
- Multi-entity (UK company vs India company) books  
- GSTIN / VAT invoices  
- Retainers & milestone billing  
- Quote → invoice conversion  
- Client credit notes  
- Bank reconciliation  

### Recommended finance roadmap (priority)
1. **P0:** Stop cascade wipe (soft-archive projects; block delete if invoices exist).  
2. **P0:** Add `currency` to Invoice + Expense; one company default.  
3. **P1:** Payment records + partial pay + void.  
4. **P1:** Project P&L = billed − expenses − (hours × cost rate).  
5. **P2:** Retainer / milestone templates.  
6. **P2:** Invoice PDF + client pay link on portal.

---

## 8. CRM / sales deep dive

### Working
- Lead statuses + kanban DnD  
- Convert lead → client  
- Outreach email drafts  

### Gaps for your business
- **No Deal board** (model exists) → no forecast  
- **No proposal/SOW** → sales handoff is informal  
- **No probability-weighted pipeline report**  
- Client email uniqueness can block real-world multi-brand contacts  

### Recommendation
Build **Deal** as first-class: Lead → Deal → Won → Client + optional Project + draft Invoice. Hide empty Contact/Deal tabs until CRUD exists.

---

## 9. Delivery / projects deep dive

### Working
- Status board, members, websites, infra tokens, credentials, demo flag  

### Gaps
- No tasks/milestones/change orders  
- Budget float without currency or burn chart  
- Workspace “AI ops” theatre distracts from delivery truth  
- Developers cannot open Projects list (by design) — ensure they still see assigned work clearly on Dashboard/Workspace  

### Recommendation for “advanced”
**Milestone checklist + change request + time-to-budget burn** on project detail. Kill fake workspace feeds.

---

## 10. People / HR deep dive

### Working
- Leave request/approve, encrypted KYC, availability layers, approvals center  

### Gaps
- No leave balances / accrual  
- No holiday calendar  
- Salary via expense category — not payroll  
- Availability UX too heavy for daily use  

### Recommendation
LeaveBalance + public holidays; simplify Availability to “weekly + exceptions” only for most users.

---

## 11. Security checklist (priority)

| Priority | Item | Status |
|---|---|---|
| P0 | Vault encrypt fallback → plaintext | **Fix / fail closed** |
| P0 | Project delete cascading invoices | **Block or soft-archive** |
| P0 | Client hard-delete cascading invoices | **Confirm product rule** |
| P1 | Enforce CSP (not report-only) | Improve |
| P1 | VIEWER write paths | Close or document |
| P1 | Shared Learning QR as secret | Rotate + audit who viewed |
| P2 | Dual-control for vault reveal | Nice for larger team |
| P2 | Session device limits | Already partially present |

---

## 12. Client portal (competitive gap)

For a software agency, clients expect:
- Progress / milestones  
- Files / SOW  
- Invoices + PDF + pay  
- Support with SLA  

You have: list projects, list invoices, open tickets.

**Missing staff Support inbox in nav** means tickets can die unread unless someone remembers `/api/support`.

---

## 13. Prioritized roadmap (how to make it “highly advanced”)

### Wave A — Trust & money (do first)
1. Fail closed on vault encryption (no plaintext fallback).  
2. Protect accounting history (no cascade destroy).  
3. Currency consistency on Invoice/Expense.  
4. Staff Support inbox under Work or People.  

### Wave B — Agency core
5. Project P&L (budget / hours / billed / cost).  
6. Deal pipeline + hide dead CRM tabs.  
7. Invoice PDF + portal pay/download.  
8. Leave balances.  

### Wave C — Advanced OS
9. Retainer & milestone billing.  
10. Resource utilization (availability × time × assignments).  
11. Client document vault + SOW acceptance.  
12. Split monolith pages; enforce CSP; Prisma enums; Decimal money.  

### Wave D — Polish
13. Workspace real-ops only.  
14. Portal branded client experience.  
15. Notification prefs fully wired.  
16. Purge orphan Turso tables after backup.  

---

## 14. Scorecard (honest)

| Area | Score (1–10) | Note |
|---|---|---|
| Auth / RBAC | 8 | Solid; VIEWER/audit drift |
| Delivery projects | 7 | Strong ops; no milestones/P&L |
| CRM | 6 | Leads good; deals incomplete |
| Finance | 6 | Usable; currency/cascade risks |
| People | 7 | Feature-rich; leave balances missing |
| Learning | 6 | Practical Percipio bridge |
| Security vault | 5 | Encrypt fallback hurts score |
| Client portal | 4 | MVP only |
| Visual consistency | 6 | Improving; workspace theatre |
| Code maintainability | 5 | Monolith pages |
| **Overall as agency OS** | **6.5** | Excellent foundation; not yet “highly advanced” |

---

## 15. Live UI scan status

**Not completed in this pass** — SUPER_ADMIN credentials were not included in the message.

When you paste them (once), I will:
1. Log in on production  
2. Walk every sidebar item + subpages (project detail, invoice create, expense categories, CRM board, portal as CLIENT if possible)  
3. Append **Section 16 — Live findings** (screenshots under `/opt/cursor/artifacts/system-audit/`) with what is broken visually vs code-only risks  

I will **not** store or reprint the password.

---

## 16. Immediate asks for you (product decisions)

Reply with decisions so implementation can be precise:

1. **Delete project with invoices:** block / archive / allow?  
2. **Company currency default:** INR only, or INR+GBP multi-entity?  
3. **CRM Deals:** build now, or hide tabs?  
4. **Portal priority:** PDF invoices vs milestones vs files first?  
5. **Workspace:** keep theatrical live feed, or strip to real data only?

---

*End of audit draft. Paste SUPER_ADMIN credentials to unlock the live page-by-page visual appendix.*
