# CLAUDE.md

Billing Service of the "oficina mecânica" system (SOAT Tech Challenge, Phase 4). It owns budgets, customer approval, Mercado Pago Checkout Pro payments and refunds, and takes part in the saga orchestrated by `oficina-backend` (ADR-011) through RabbitMQ only. READMEs, docs and code comments are in Brazilian Portuguese.

## Commands

```bash
npm run start:dev           # http://localhost:3000/api/billing/docs
npm test -- --coverage      # unit tests, 80% threshold on domain/ + application/
npm run test:e2e            # boots AppModule
npm run test:int            # integration tests (run in band)
npm run lint                # ESLint + Prettier with --fix
npm run build               # output in dist/src (start:prod = node dist/src/main)
npm run prisma:generate     # Prisma client into generated/prisma
npm run prisma:migrate:deploy
```

## Conventions

Same architecture and conventions as `oficina-backend` (read its `CLAUDE.md`): Clean Architecture/DDD layers (`domain`, `application`, `infrastructure`, `shared`), path aliases `@domain/*`, `@application/*`, `@infrastructure/*`, `@shared/*`, repositories as abstract classes used as DI tokens, one use case per file with `Logger` injected last, application code throws only `@shared/exceptions/domain.exceptions` (mapped by `HttpExceptionFilter`), import ordering by clause length.

- **Clean code, few comments.** Names and small functions explain the code; a comment only for a short, non-obvious "why". Longer explanations go to the README, `docs/` or the ADRs in `oficina-backend`.
- **Route prefix `api/billing`** on every controller: Traefik routes by path prefix (ADR-015), and `/api` alone belongs to the OS Service.
- **Money:** amounts travel as 2-decimal strings (`"195.90"`, message contract section 1). Use `Money` (`domain/value-objects`), which works in integer cents; never do arithmetic with `number` amounts.
- **Observability:** `startTracing()` is the first thing `main.ts` runs (imports above it silently disable OpenTelemetry). `OTEL_SERVICE_NAME=oficina-billing-service`.
- **Budget flow:** `billing.budget.create` and `billing.budget.cancel` arrive on `billing.commands` and are handled by `CreateBudgetUseCase` / `CancelBudgetUseCase` (registered in `BillingCommandHandlers`). Invalid payloads never go to the DLQ: they become `billing.budget.creation-failed` so the saga compensates. One budget per saga (`budgets.sagaId` unique); a repeated create answers `created` again. Customer approve/reject publish `approved` / `rejected`. Events are built only in `application/budget/budget-events.ts`.
- **Messaging infrastructure** (outbox, relay, idempotent consumer, retry/DLQ, `PrismaService.runInTransaction` with AsyncLocalStorage) is copied from `oficina-backend`; its `CLAUDE.md` "Messaging" section applies here. Use cases write events with `IOutboxRepository.add()` inside `ITransactionManager.run()`, never publish directly.
- **Mercado Pago** sits behind the `IPaymentGateway` port (`infrastructure/payment/mercado-pago.gateway.ts`, official SDK). It throws only `PaymentGatewayUnavailableException` (retry / HTTP 503) or `PaymentGatewayRejectedException` (definitive). `ApproveBudgetUseCase` creates the checkout **before** the DB transaction with `idempotencyKey = budgetId`. The webhook (`MercadoPagoWebhookController`, public) answers 200 and ignores anything that is not `type=payment` with a `data.id` (legacy IPN and `merchant_order` notifications arrive unsigned) before validating `x-signature` with the SDK `WebhookSignatureValidator`, then `HandlePaymentNotificationUseCase` re-fetches the payment from the API (never trusts the body), dedups in Redis (`mp:webhook:<id>:<status>`) under a per-order Redis lock, and relies on `PaymentEntity` transitions returning `false` as the second line of defense. A payment Mercado Pago does not know (404, e.g. the panel's simulated notification) is ignored with 200; only `PaymentGatewayUnavailableException` makes the webhook fail so Mercado Pago retries. Tests never call Mercado Pago: override `IPaymentGateway`.
- **Redis** (`infrastructure/redis/`) is optional in dev/tests: without `REDIS_URL` the idempotency store and the lock fall back to in-process memory.
- **Access rule:** `assertCanAccess` (`application/budget/requester.ts`): a `CUSTOMER` token only reaches budgets whose `customer.id === token.sub`; another customer's budget and a missing one return the same 404.
- **Auth:** global `JwtAuthGuard` + `RolesGuard`. A route without `@Roles` admits any staff role but **denies `CUSTOMER`** (same "customer denied by default" rule as the OS `CustomerScopeGuard`): list `TokenRole.CUSTOMER` explicitly where a customer may enter. Secrets go through `requiredInProduction()` (`infrastructure/config/`): with `NODE_ENV=production`, a missing `JWT_SECRET` or `MP_WEBHOOK_SECRET` stops the boot instead of falling back to a known default.
- **Message contract** lives in `oficina-backend/docs/arquitetura/contratos-de-mensagens.md` and is the source of truth: change it there first.
- **CI/CD** mirrors `oficina-backend` (`docs/arquitetura/esteira-ci-cd.md` there), including what SonarCloud enforces: `npm ci --ignore-scripts`, third-party actions pinned by commit SHA, no hardcoded passwords, non-root image, `automountServiceAccountToken: false`, memory limits on every container.
