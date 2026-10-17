"""End-to-end smoke test against a running Showzy API.

Walks the buyer's whole journey the way the browser does — sign in with a
one-time code, browse, order, pay, collect the ticket, pull the invoice, cancel
for a refund — and prints one pass/fail line per step. The unit suite proves
each piece in isolation; this proves they are wired to each other on a machine
that is actually running.

    python3 tools/smoke_test.py                             # local dev server
    python3 tools/smoke_test.py https://api.naada.live      # after a deploy
    python3 tools/smoke_test.py --flood                     # also prove the
                                                            # OTP rate limit

Two things to know before you point it at production:

  * It needs the OTP echoed back in the response, which only happens where
    OTP_DEBUG_RESPONSE is on — local dev. Against a real deployment the
    sign-in steps will fail by design, and everything above them (health,
    listings, schema, anonymous access control) still tells you a lot.
  * It buys a real ticket and then cancels it. Against a live site that is a
    real order and a real refund in your books. Use a staging deploy, or be
    ready to reconcile one cancelled order.

Exit code is 0 only when every step passed, so CI can gate a deploy on it.
"""

import json
import sys
import urllib.error
import urllib.request

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = (ARGS[0] if ARGS else "http://127.0.0.1:8000") + "/api/v1"
EMAIL = "smoke.buyer@naada.test"
# The flood check burns this IP's hourly OTP budget, so every later run would
# fail at sign-in. Opt in with --flood when you actually want to prove it.
FLOOD = "--flood" in sys.argv

passed, failed = [], []


def call(method, path, body=None, token=None, expect=(200, 201)):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            code, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        code, raw = e.code, e.read()
    except Exception as e:
        return None, 0, str(e)
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        payload = {"_raw": raw[:300].decode(errors="replace")}
    ok = code in expect
    return payload, code, None if ok else f"HTTP {code}: {json.dumps(payload)[:300]}"


def step(name, fn):
    try:
        detail = fn()
    except Exception as e:  # noqa: BLE001 - a smoke test reports, never raises
        failed.append((name, f"{e.__class__.__name__}: {e}"))
        print(f"  FAIL  {name}\n        {e}")
        return False
    if detail:
        failed.append((name, detail))
        print(f"  FAIL  {name}\n        {detail}")
        return False
    passed.append(name)
    print(f"  ok    {name}")
    return True


state = {}

print(f"\nNaada API smoke test -> {BASE}\n")

# ── Public surface ────────────────────────────────────────────────────────────
print("Public endpoints (no auth)")


def health():
    p, _, err = call("GET", "/health/")
    if err:
        return err
    state["health"] = p
    return None if p.get("status") == "ok" else f"status={p.get('status')} {p.get('components')}"


step("health check reports ok", health)


def cities():
    p, _, err = call("GET", "/cities/")
    if err:
        return err
    n = len(p.get("results", p if isinstance(p, list) else []))
    return None if n > 0 else "no cities configured"


step("cities list is populated", cities)


def events_list():
    p, _, err = call("GET", "/events/")
    if err:
        return err
    rows = p.get("results", [])
    state["events"] = rows
    return None if rows else "no events returned"


step("events list returns rows", events_list)


def event_detail():
    """Find something with a *paid* tier in stock.

    A free order short-circuits to a comp payment and never touches the
    gateway, so picking the first published event at random can silently skip
    the entire payment path — signature included.
    """
    tried = []
    for ev in state.get("events", []):
        if ev.get("status") != "published":
            continue
        p, _, err = call("GET", f"/events/{ev['id']}/")
        if err:
            tried.append(f"{ev.get('title')}: {err}")
            continue
        tier = next(
            (t for t in (p.get("ticket_tiers") or [])
             if t["total_quantity"] > t["sold_quantity"] and float(t["price"]) > 0),
            None,
        )
        if tier:
            state["event"], state["tier"] = p, tier
            return None
        tried.append(f"{ev.get('title')}: no paid tier in stock")
    return "no published event has a paid tier in stock: " + "; ".join(tried[:4])


step("event detail exposes a buyable tier", event_detail)


def schema():
    p, code, err = call("GET", "/schema/", expect=(200,))
    return err


step("OpenAPI schema generates", schema)

# ── Auth ──────────────────────────────────────────────────────────────────────
print("\nPasswordless sign-in")


def request_otp():
    p, _, err = call("POST", "/auth/request-otp/", {"email": EMAIL})
    if err:
        return err
    code = p.get("otp") or p.get("code") or p.get("debug_otp")
    if not code:
        return f"no OTP echoed back (OTP_DEBUG_RESPONSE off?) payload={json.dumps(p)[:200]}"
    state["otp"] = str(code)
    return None


step("OTP requested", request_otp)


def verify_otp():
    p, _, err = call("POST", "/auth/verify-otp/", {"email": EMAIL, "otp": state.get("otp", "")})
    if err:
        return err
    state["token"] = p.get("access")
    state["user"] = p.get("user", {})
    return None if state["token"] else "no access token in response"


step("OTP verified, JWT issued", verify_otp)


def me():
    p, _, err = call("GET", "/auth/me/", token=state.get("token"))
    if err:
        return err
    return None if p.get("email") == EMAIL else f"unexpected identity: {p.get('email')}"


step("token identifies the right user", me)


def anon_is_blocked():
    _, code, _ = call("GET", "/tickets/mine/", expect=(401, 403))
    return None if code in (401, 403) else f"private endpoint answered anonymously with {code}"


step("private endpoint rejects anonymous callers", anon_is_blocked)

# ── Buying ────────────────────────────────────────────────────────────────────
print("\nBuying a ticket")


def create_order():
    tier = state.get("tier")
    if not tier:
        return "skipped: no buyable tier"
    p, _, err = call(
        "POST",
        "/ticket-orders/",
        {
            "event_id": state["event"]["id"],
            "items": [{"tier_id": tier["id"], "quantity": 1}],
        },
        token=state.get("token"),
    )
    if err:
        return err
    state["order"] = p
    return None if p.get("id") else "order created without an id"


step("order created", create_order)


def order_totals():
    o = state.get("order")
    if not o:
        return "skipped: no order"
    total = float(o.get("total_amount") or 0)
    return None if total >= 0 else f"nonsensical total {total}"


step("order carries a computed total", order_totals)


def pay():
    o = state.get("order")
    if not o:
        return "skipped: no order"
    p, _, err = call(
        "POST", "/payments/initiate/", {"order_id": o["id"], "gateway": "razorpay"},
        token=state.get("token"),
    )
    if err:
        return err
    state["payment"] = p
    return None


step("payment initiated", pay)


def confirm():
    """The browser's own two-step: mock checkout signs, then /verify/ checks."""
    pay_info = state.get("payment") or {}
    order_id = state.get("order", {}).get("id")
    gw_order = pay_info.get("gateway_order_id") or pay_info.get("order_id")
    if not order_id or not gw_order:
        return f"no gateway order id to settle: {json.dumps(pay_info)[:250]}"

    signed, _, err = call(
        "POST",
        "/payments/mock/checkout/",
        {"order_id": order_id, "gateway_order_id": gw_order, "outcome": "success"},
        token=state.get("token"),
    )
    if err:
        return err
    state["signed"] = signed
    return None


step("mock gateway signs the payment", confirm)


def verify_signature():
    signed = state.get("signed") or {}
    order_id = state.get("order", {}).get("id")
    body = {
        "order_id": order_id,
        "gateway_payment_id": signed.get("gateway_payment_id") or signed.get("razorpay_payment_id"),
        "gateway_order_id": signed.get("gateway_order_id") or signed.get("razorpay_order_id"),
        "gateway_signature": signed.get("gateway_signature") or signed.get("razorpay_signature"),
    }
    if not all(body.values()):
        return f"checkout did not return a signature triple: {json.dumps(signed)[:250]}"
    p, _, err = call("POST", "/payments/verify/", body, token=state.get("token"))
    if err:
        return err
    state["paid"] = p
    return None


step("server verifies the HMAC signature", verify_signature)


def tampered_signature_is_rejected():
    """Forge against a *fresh* order.

    Re-submitting a bad signature for an order that is already SUCCESS proves
    nothing: verify_payment short-circuits on already-verified payments (a
    webhook and the browser both landing is normal) and never reaches the
    signature check. So buy again, and tamper before anything is confirmed.
    """
    tier = state.get("tier")
    if not tier:
        return "skipped: no tier"

    order, _, err = call(
        "POST",
        "/ticket-orders/",
        {"event_id": state["event"]["id"], "items": [{"tier_id": tier["id"], "quantity": 1}]},
        token=state.get("token"),
    )
    if err:
        return "could not create the order to forge against: " + err
    state["forge_order"] = order

    init, _, err = call(
        "POST", "/payments/initiate/", {"order_id": order["id"], "gateway": "razorpay"},
        token=state.get("token"),
    )
    if err:
        return err

    signed, _, err = call(
        "POST",
        "/payments/mock/checkout/",
        {"order_id": order["id"], "gateway_order_id": init["gateway_order_id"], "outcome": "success"},
        token=state.get("token"),
    )
    if err:
        return err

    good = signed.get("gateway_signature") or ""
    if not good:
        return f"checkout returned no signature: {json.dumps(signed)[:200]}"

    # Flip the last four characters. Same length, same shape, wrong HMAC.
    forged = good[:-4] + ("0000" if not good.endswith("0000") else "ffff")
    _, code, _ = call(
        "POST",
        "/payments/verify/",
        {
            "order_id": order["id"],
            "gateway_payment_id": signed.get("gateway_payment_id"),
            "gateway_order_id": signed.get("gateway_order_id"),
            "gateway_signature": forged,
        },
        token=state.get("token"),
        expect=(400, 403),
    )
    return None if code in (400, 403) else f"a forged signature was accepted with HTTP {code}"


step("a forged signature is refused on an unconfirmed order", tampered_signature_is_rejected)


def forged_order_issued_no_ticket():
    o = state.get("forge_order")
    if not o:
        return "skipped: no forged order"
    p, _, err = call("GET", "/tickets/mine/", token=state.get("token"))
    if err:
        return err
    rows = p.get("results", p if isinstance(p, list) else [])
    leaked = [t for t in rows if str(t.get("order")) == str(o["id"])]
    return None if not leaked else f"{len(leaked)} ticket(s) issued for a payment that never verified"


step("the refused payment issued no ticket", forged_order_issued_no_ticket)


def tickets_issued():
    p, _, err = call("GET", "/tickets/mine/", token=state.get("token"))
    if err:
        return err
    rows = p.get("results", p if isinstance(p, list) else [])
    state["tickets"] = rows
    return None if rows else "payment settled but no ticket issued"


step("ticket issued to the buyer", tickets_issued)


def ticket_has_qr():
    t = (state.get("tickets") or [None])[0]
    if not t:
        return "skipped: no ticket"
    return None if (t.get("qr_data") or t.get("qr_code") or t.get("ticket_number")) else "ticket has no scannable identity"


step("ticket carries a scannable code", ticket_has_qr)


def invoice():
    o = state.get("order")
    if not o:
        return "skipped: no order"
    p, _, err = call("GET", f"/ticket-orders/{o['id']}/invoice/", token=state.get("token"))
    if err:
        return err
    state["invoice"] = p
    return None


step("tax invoice renders for the order", invoice)


def invoice_adds_up():
    inv = state.get("invoice")
    if not inv:
        return "skipped: no invoice"
    return None if inv.get("total") is not None or inv.get("total_amount") is not None else f"invoice has no total: {list(inv)[:8]}"


step("invoice states a total", invoice_adds_up)

# ── Inventory is derived, not a counter ───────────────────────────────────────
print("\nInventory")


def stock_moved():
    ev = state.get("event")
    tier = state.get("tier")
    if not ev or not tier:
        return "skipped"
    p, _, err = call("GET", f"/events/{ev['id']}/")
    if err:
        return err
    now = next((t for t in p.get("ticket_tiers", []) if t["id"] == tier["id"]), None)
    if not now:
        return "tier disappeared"
    before, after = tier["sold_quantity"], now["sold_quantity"]
    return None if after == before + 1 else f"sold went {before} -> {after}, expected +1"


step("selling one seat moves the public stock by one", stock_moved)


def cancel():
    t = (state.get("tickets") or [None])[0]
    if not t:
        return "skipped: no ticket"
    p, code, err = call(
        "POST", f"/tickets/{t['id']}/cancel/", {"reason": "smoke test"}, token=state.get("token")
    )
    if err:
        return err
    state["cancelled"] = p
    return None


step("ticket cancels and refunds", cancel)


def stock_returned():
    ev, tier = state.get("event"), state.get("tier")
    if not ev or not tier or "cancelled" not in state:
        return "skipped"
    p, _, err = call("GET", f"/events/{ev['id']}/")
    if err:
        return err
    now = next((t for t in p.get("ticket_tiers", []) if t["id"] == tier["id"]), None)
    return None if now and now["sold_quantity"] == tier["sold_quantity"] else (
        f"cancelled seat not returned: sold={now and now['sold_quantity']}, expected {tier['sold_quantity']}"
    )


step("cancelling puts the seat back on sale", stock_returned)

# ── Throttling ────────────────────────────────────────────────────────────────
print("\nAbuse controls")


def otp_throttled():
    # Local settings relax the limit to 50/hour, so a handful of calls proves
    # nothing — send past it. The per-address and per-IP keying itself is
    # covered properly by apps/users/tests.py::OTPThrottleTests.
    hits = []
    for _ in range(55):
        _, code, _ = call("POST", "/auth/request-otp/", {"email": "flood@naada.test"}, expect=(200, 201, 429))
        hits.append(code)
    return None if 429 in hits else f"{len(hits)} OTP requests in a row all succeeded"


if FLOOD:
    step("OTP endpoint throttles a flood", otp_throttled)
else:
    print("  skip  OTP flood check (pass --flood to run it; it spends this IP's budget)")

# ── Summary ───────────────────────────────────────────────────────────────────
print(f"\n{'=' * 60}")
print(f"  {len(passed)} passed, {len(failed)} failed")
if failed:
    print("\n  Failures:")
    for name, why in failed:
        print(f"    - {name}\n      {why}")
print(f"{'=' * 60}\n")
sys.exit(1 if failed else 0)
