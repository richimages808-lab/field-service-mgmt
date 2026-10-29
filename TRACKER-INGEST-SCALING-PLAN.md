# Tracker Ingest Scaling Plan (Future State)

**Status:** Planned — pilot (Phase 1) is live on staging
**Created:** 2026-10-21
**Related:** [TRACKER-RESELLER-STRATEGY-AND-CHARGING-MODELS.md](TRACKER-RESELLER-STRATEGY-AND-CHARGING-MODELS.md), `firebase/functions/src/trackerIngest.ts`, `frontend/web/src/lib/trackerDevices.ts`

---

## 1. Core Principle: Scale Is Driven by Gateways, Not Tags

BLE tags (Minew E8, etc.) never connect to the internet. A gateway (Minew MG5 in a vehicle, or a technician's phone) hears every nearby tag and publishes **one MQTT message listing all of them**.

| Driver | What it affects |
|---|---|
| # of gateways | Broker connections / session minutes, cellular SIM cost |
| Reporting interval | Message count, cellular data, function invocations |
| # of tags | Payload size, Firestore writes (only if not de-duplicated/throttled) |

20,000 tags across 1,000–2,000 vehicles is a routine broker workload. The real costs are **cellular data** and **database writes**.

---

## 2. Phased Architecture

### Phase 1 — Pilot (< 50 gateways) ✅ built
```
MG5 ──MQTT/TLS──► EMQX Cloud Serverless ──HTTP rule action──► ingestTrackerTelemetry (Cloud Function) ──► Firestore
```
- Free tier: 1M session min, 1 GB traffic, 1M rule actions / month.
- One org-level ingest key (`x-dispatchbox-key`), hashed in `tracker_ingest_keys`.
- History throttled (gateway 5/30 min, tag 15/60 min), 90-day TTL on `tracker_locations.expireAt`.

### Phase 2 — Resale (hundreds → low thousands of gateways)
```
Gateways ──MQTT/TLS──► EMQX Dedicated  (or AWS IoT Core)
                         │  per-gateway credentials + topic ACLs
                         ▼
                   Google Pub/Sub topic  (tracker-telemetry)
                         ▼
          Cloud Run worker (batched pull, idempotent)
            ├─ dedupe / tag arbitration
            ├─ change-only writes → Firestore (latest state)
            └─ history points  → Firestore (TTL) or BigQuery
```
### Phase 3 — Large (5,000+ gateways / margin focus)
- Self-hosted broker cluster (EMQX or Mosquitto/VerneMQ) on GKE or managed instance group.
  - ⚠️ Verify EMQX open-source licensing for commercial clustering before choosing it.
- History moves fully to **BigQuery** (partitioned by day, clustered by org_id/device_id); Firestore holds only current state.
- Regional brokers if customers span regions.

> **Build vs. buy:** Never write a broker. Buy/host a proven one; build the DispatchBox-specific layer (parsing, arbitration, state, UI).

---

## 3. Work Items for Phase 2

| # | Item | Notes |
|---|---|---|
| 1 | **Per-gateway credentials** | Generated in DispatchBox when a gateway is registered; pushed to the broker via its management API. Replace the single org key. |
| 2 | **Topic ACLs / tenant isolation** | Topic scheme `dbx/{orgId}/gw/{gatewayMac}/up`. Gateway may only publish to its own topic. Worker trusts topic-derived orgId, never payload. |
| 3 | **Broker → Pub/Sub bridge** | EMQX has native GCP Pub/Sub data integration. Removes per-message HTTP calls. |
| 4 | **Cloud Run batch worker** | Port `parsePayload` / `processReading` from `trackerIngest.ts`. Pull 100–1000 msgs, group by gateway, one Firestore batch per group. Idempotent on (gatewayId, timestamp). |
| 5 | **Change-only writes** | Write a tag/gateway doc only when: tag joins/leaves a gateway, location moved > threshold, battery bucket drops, or heartbeat interval (15 min) elapsed. Target ~90% write reduction. |
| 6 | **Tag arbitration** | When multiple gateways hear one tag: keep current owner unless another gateway's RSSI is stronger by > 6 dB for 2+ consecutive reports. |
| 7 | **Zero-touch provisioning** | Customer scans MG5 QR / enters MAC+IMEI → DispatchBox creates broker credentials → config file / instructions generated for Minew config tool. |
| 8 | **Phone-as-gateway** | Mobile app scans BLE tags in the background and publishes the same normalized payload. Covers tools off-truck without hardware/SIM cost. |
| 9 | **Observability** | Per-org message rate, last-message timestamp per gateway, dead-letter topic for unparseable payloads, alert on silent gateways. |
| 10 | **Usage metering** | Count active gateways/tags per org per month for billing (feeds reseller pricing). |

---

## 4. Cost Model (rough, unverified — re-quote before committing)

Assumptions: 20,000 tags, 2,000 gateways, 60 s reporting interval ≈ 86M messages/month.

| Line item | Est. monthly |
|---|---|
| Broker — EMQX Serverless pay-as-you-go or AWS IoT Core | $100–250 |
| Broker — self-hosted on GCP (Phase 3) | $50–150 + ops time |
| Pub/Sub + Cloud Run worker | $30–80 |
| Firestore writes (with change-only writes) | $50–150 |
| BigQuery history storage/queries | $10–50 |
| **Cellular IoT SIMs (MG5)** | **$1–5 / gateway → $2k–10k** ← dominant cost |

**Implications for pricing:** sell **per vehicle/gateway** (bundling SIM + platform) plus a small per-tag fee. Platform cost per tag is pennies; SIM cost per gateway is dollars.

**Levers:** longer intervals when parked (2–5 min), pooled-data IoT SIM providers (1NCE, Hologram, Soracom), phone-as-gateway for off-truck coverage.

---

## 5. Open Questions / Dependencies
- Minew MG5 "Parsed JSON Format" doc + topic structure (requested from Minew support). Parser currently has a provisional MG5 shape.
- MG5 TLS support details (CA cert upload, SNI) for EMQX/AWS IoT.
- IoT SIM provider selection and per-gateway data usage measured during pilot.
- Whether TagCloud's data push is a viable alternative for customers who already use Minew's cloud.

---

## 6. Triggers to Move Phases
- **→ Phase 2:** first paying reseller customer, OR > 50 gateways, OR EMQX free tier exceeded, OR > 1M function invocations/month.
- **→ Phase 3:** > 5,000 gateways, OR broker bill > ~$1,000/month, OR multi-region customers.
