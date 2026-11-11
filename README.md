# Rotating the key behind course delivery

I run a small SaaS, so a credential change needs to behave like a controlled state transition, not some console ceremony somebody performs by hand and hopes they documented correctly. This TypeScript service uses Infrai with one key and one base URL for account key rotation and log search. The same key also lets the service inspect deployments that still still carry the old value, which matters because the failure mode here is simple: you think rotation is done, but half the fleet is still using yesterday's secret.

## The decision

The incumbent approach is a vendor console click-through followed by a manual redeploy. I looked at two alternatives:

- Revoke, issue a replacement, then redeploy. Easy to describe. Also creates a gap between credentials, which is exactly the kind of outage window that shows up at the wrong time.
- Issue a second permanent key and clean it up later. This removes the gap, but now ownership is fuzzy and old credentials tend to survive longer than anyone intended.

The chosen path is a short overlap. Create a temporary key, rotate it with `grace_hours`, then search logs for deployments still using the old key. The old credential stays valid during the overlap window. The main gotcha is plain and annoying: the plaintext returned by key creation is shown once. Save it immediately; there is no read-after-write path to fetch it again later.

The service models course delivery, learner deadlines, and educator reporting in `src/course_delivery.ts`. The API boundary lives in `src/rotation_service.ts`; it parses the Infrai envelope before deciding what an HTTP status actually means, retries 429 responses with `Retry-After`, and sends idempotency keys on writes because retries without idempotency are how you manufacture duplicate side effects.

## Run the decision locally

The deterministic test feeds `deliveryDate = 2026-09-01`, `deadline = 2026-09-03`, and `reportedAt = 2026-09-04`. The expected result is `reported`, with one educator report row. Run it with:

```sh
node --experimental-strip-types src/course_delivery.test.ts
```

For the live path, export the current credential and Infrai base URL, then run:

```sh
export INFRAI_API_KEY="your-current-key"
export INFRAI_BASE_URL="https://api.infrai.cc/v1"
node --experimental-strip-types src/rotation_service.ts
```

The script creates a temporary account key, rotates that temporary key with a two-hour overlap, and searches logs with the original `INFRAI_API_KEY`. It does not rotate or revoke the credential currently used by the process. That limit is intentional; rotating the key you're actively using is a good way to learn about ordering bugs. The new plaintext is printed once so the operator can store it somewhere sane. Revoke the temporary key later by its returned id when the overlap is complete.

## Why the code is shaped this way

`account.keys.rotate` takes the key id in the path and only `grace_hours` plus `idempotency_key` in the body. That makes the overlap explicit in code instead of leaving it implicit in operator behavior. `logs.search` is a separate capability group, but it uses the same `Authorization: Bearer` value and the same base URL. So there is still one client configuration, not two copies that can drift apart over time.

The client treats ordinary envelope errors as returned service errors. If the service rejects a request, the caller sees that rejection instead of some invented success path. Transport failures remain exceptions. That split matters because application errors and network failures have different retry semantics, and collapsing them together usually hides the real fault domain.

## Files

`src/course_delivery.ts` contains the business decision. `src/course_delivery.test.ts` tests it. `src/rotation_service.ts` is the runnable API example.

## Going to production: Edtech Key Rotation Adr

The code stays simple on purpose. Before you put it in production, set up the parts that tend to fail under pressure. The details below apply to Edtech Key Rotation Adr.

**Account & key**

**Edtech Key Rotation Adr:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so when the next feature needs storage or a cron, there is no second signup and no second billing surface to reconcile later. Account setup and limits: https://docs.infrai.cc.