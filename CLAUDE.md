\# CLAUDE REFACTORING RULES



Goal: Make this codebase easier for experienced engineers to understand \*\*without changing behavior\*\*.



\## Hard Rules (Do Not Break)



\- Do not change business logic or data flows.

\- Do not change API contracts, database queries, or queue/job names.

\- Do not change how calculations work (profit, forecasting, lead times, supplier performance, inventory movements).

\- Prefer small, local refactors: renames, extracting helpers, splitting big files, reorganizing files.

\- For every change, show a clear diff and explain in plain English what changed and what should still work exactly the same.



\## Architecture \& Domains



This is an internal e‑commerce operations platform. Main domains:



\- Dashboard (AI insights, calendar, profit overview)

\- Products (Amazon products, per‑SKU settings)

\- Inventory (warehouses, FBA)

\- Forecasting (demand, lead times, reorder recommendations)

\- Warehouses

\- Orders

\- Purchase Orders (affect supplier performance and forecasting lead times)

\- FBA Shipments

\- Suppliers

\- Profit \& Audit

\- Employees \& Time clock

\- Customer Service / Support

\- Settings

\- Sync Infrastructure (Amazon SP‑API, queues, workers)



Key data relationships:

\- Purchase Orders → Supplier Performance → Forecasting Lead Times.

\- Orders/Sales → Profit Engine → Dashboard summaries.

\- Inventory (FBA + warehouses) → Forecasting → Purchase Order recommendations.

\- Products are the master entity linked to suppliers, inventory, orders, POs, shipments, forecasts, and profit.



\## Separation of Concerns



\- API routes:

&nbsp; - Only handle HTTP (request/response, auth, validation).

&nbsp; - Call separate helpers/services for business logic and database work.

\- Business logic:

&nbsp; - Lives in `lib/` or clear domain services, not inside API routes or page components.

\- UI components/pages:

&nbsp; - Focus on rendering and calling hooks/services.

&nbsp; - Avoid mixing complex business rules directly inside components.



\## File \& Component Size



\- Avoid “god files”:

&nbsp; - Large files like `lib/queues/worker.ts`, `app/forecasting/page.tsx`, `app/purchase-orders/page.tsx`

&nbsp;   should be split into smaller modules/components with clear responsibilities.

\- For pages with many tabs or complex state:

&nbsp; - Extract each tab or major section into its own component.

&nbsp; - Use custom hooks or other patterns to reduce 15–20+ `useState` calls in one place.



\## Types \& Utilities



\- Move inline type definitions out of components/pages into a `/types` directory.

&nbsp; - Example files: `types/forecasting.ts`, `types/purchase-orders.ts`, `types/inventory.ts`, etc.

\- Centralize common utilities:

&nbsp; - Date/time/timezone handling.

&nbsp; - Currency and number formatting.

&nbsp; - Reusable parsing logic (e.g., Amazon reports, CSV uploads).

\- Avoid copy‑pasting utilities; import shared helpers instead.



\## Specific Problem Areas (Refactor Guidance)



\- `lib/queues/worker.ts`:

&nbsp; - Extract each job type (orders, products, inventory, ads, finances, FBA shipments, alerts, etc.)

&nbsp;   into separate modules under `lib/queues/jobs/`.

&nbsp; - `worker.ts` should mainly route jobs to specific handlers.

&nbsp; - Do not change job names, queue configuration, or database logic in the first refactor step.



\- `app/forecasting/page.tsx`:

&nbsp; - Split into smaller components per tab.

&nbsp; - Extract state logic into custom hooks where it improves clarity.

&nbsp; - Keep all existing behavior, filters, and API calls the same.



\- `app/purchase-orders/page.tsx`:

&nbsp; - Reduce state explosion by extracting modals/forms into their own components/hooks.

&nbsp; - Reuse SKU dropdown logic instead of duplicating it.



\- `components/shipments/PickingSection.tsx`:

&nbsp; - Separate UI rendering from scanning/validation/printing logic.

&nbsp; - Consider a hook for scanning logic and separate components for UI sections.



\- `components/inventory/WarehouseInventoryUpload.tsx`:

&nbsp; - Separate file parsing/validation from UI and state.

&nbsp; - Extract CSV/Excel parsing into a helper or service.



\- `lib/profit/engine.ts`:

&nbsp; - Keep it the single source of truth for profit logic.

&nbsp; - Internally, group related pieces (date utils, SQL queries, metric derivations) into clearly

&nbsp;   separated functions or sections without changing the formulas or query results.



\## Style Goals (“Human‑Coded” Feel)



\- Names should describe purpose, not implementation details.

\- A new engineer should be able to tell what a file does from its name and location.

\- Each file and component should have one main responsibility.

\- Comments explain non‑obvious business rules (e.g., how supplier performance adjusts lead times),

&nbsp; not obvious code.

\- Prefer clarity and consistency over clever or overly abstract solutions.



\## How to Use This File



\- Before refactoring, read this file and follow all rules.

\- Work on one area/file at a time.

\- Always:

&nbsp; - Keep behavior identical.

&nbsp; - Show diffs.

&nbsp; - Explain in plain English why the change makes the code easier for engineers to understand.



