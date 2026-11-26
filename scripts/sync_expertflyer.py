#!/usr/bin/env python3
"""Sync live ExpertFlyer seat map loads into standby-flight-dashboard D1."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from playwright.sync_api import sync_playwright

DEFAULT_WORKER_URL = "https://standby-flight-dashboard.michaelborland71.workers.dev"
CABIN_MAP = {
    "F": "first",
    "J": "business",
    "C": "business",
    "W": "prem_econ",
    "Y": "economy",
}


def http_json(url: str, payload: dict[str, Any] | None = None) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"User-Agent": "standby-flight-dashboard-sync/1.0"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def hours_until_departure(dep_date: str, dep_time: str | None) -> float | None:
    if not dep_date:
        return None
    hhmm = dep_time if (dep_time and re.match(r"^\d{2}:\d{2}$", dep_time)) else "18:00"
    try:
        dt = datetime.fromisoformat(f"{dep_date}T{hhmm}:00+00:00")
    except ValueError:
        return None
    return (dt - datetime.now(timezone.utc)).total_seconds() / 3600.0


def is_watch_due(watch: dict[str, Any]) -> tuple[bool, float | None, str]:
    hrs = hours_until_departure(watch.get("departure_date", ""), watch.get("departure_time"))
    if hrs is None:
        return False, None, "invalid date"
    if hrs < -1.0:
        return False, hrs, "departed"
    if hrs > 336.0:
        return False, hrs, ">14d out"

    updated_raw = str(watch.get("updated_at") or "").strip()
    age_mins = 9999.0
    if updated_raw:
        try:
            iso = updated_raw.replace(" ", "T")
            if not iso.endswith("Z") and "+" not in iso:
                iso += "+00:00"
            prev_dt = datetime.fromisoformat(iso)
            age_mins = (datetime.now(timezone.utc) - prev_dt).total_seconds() / 60.0
        except ValueError:
            pass

    # Pre-close window (T-95m to T-60m): always capture latest load before check-in closes
    if 0.9 <= hrs <= 1.6:
        return True, hrs, "pre-close window"
    if hrs < 0.9:
        # Inside T-54m: refresh if we haven't checked in the last 30m (last-known-good preserved if locked)
        return (age_mins >= 30.0), hrs, "post-close check"
    if hrs <= 24.0:
        return (age_mins >= 30.0), hrs, "T-24h check-in window"
    return (age_mins >= 180.0), hrs, "standard 3h cadence"


def parse_seatmap_payload(raw_text: str) -> dict[str, Any] | None:
    obj = None
    for line in raw_text.splitlines():
        if '"seatMap"' in line and '"detailedView"' in line and ":" in line:
            _, rest = line.split(":", 1)
            try:
                obj = json.loads(rest)
                break
            except Exception:
                continue
    if not obj or not isinstance(obj.get("seatMap"), dict):
        return None

    sections = obj["seatMap"].get("sections") or []
    if not sections:
        return None

    cabins: dict[str, dict[str, int]] = {
        "first": {"available": 0, "occupied": 0, "blocked": 0, "total": 0},
        "business": {"available": 0, "occupied": 0, "blocked": 0, "total": 0},
        "prem_econ": {"available": 0, "occupied": 0, "blocked": 0, "total": 0},
        "economy": {"available": 0, "occupied": 0, "blocked": 0, "total": 0},
    }

    for sec in sections:
        code = str(sec.get("cabinCode") or sec.get("displayCabinCode") or "").upper()
        key = CABIN_MAP.get(code)
        if not key:
            continue
        for row in sec.get("rows") or []:
            for s in row.get("seats") or []:
                if s.get("type") != "seat":
                    continue
                cabins[key]["total"] += 1
                st = str(s.get("status") or "").lower()
                if st == "available":
                    cabins[key]["available"] += 1
                elif st == "occupied":
                    cabins[key]["occupied"] += 1
                elif st == "blocked":
                    cabins[key]["blocked"] += 1

    aircraft = ""
    info = obj["seatMap"].get("info") or {}
    if isinstance(info.get("aircraft"), dict):
        aircraft = str(info["aircraft"].get("type") or info["aircraft"].get("equipmentCode") or "")

    return {"cabins": cabins, "aircraft": aircraft}


def fetch_seatmaps(
    email: str,
    password: str,
    queries: list[dict[str, str]],
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if not queries:
        return results

    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
        )
        page = ctx.new_page()
        page.route(
            "**/*",
            lambda route: route.abort()
            if (
                route.request.resource_type in ("image", "media", "font", "stylesheet")
                or any(
                    x in route.request.url
                    for x in [
                        "cookielaw",
                        "onetrust",
                        "sentry",
                        "googletagmanager",
                        "clarity",
                        "doubleclick",
                        "hotjar",
                        "intercom",
                    ]
                )
            )
            else route.continue_(),
        )

        captured: dict[str, str] = {"body": ""}

        def on_resp(r: Any) -> None:
            if "/air/seat-map/results" in r.url and r.request.method == "POST":
                try:
                    txt = r.text()
                    if len(txt) > len(captured["body"]):
                        captured["body"] = txt
                except Exception:
                    pass

        page.on("response", on_resp)

        first_q = queries[0]
        first_target = (
            "/air/seat-map/results?"
            + urllib.parse.urlencode(
                {
                    "departingAirport": first_q["origin"],
                    "arrivingAirport": first_q["destination"],
                    "departDate": first_q["departure_date"],
                    "airline": first_q["airline"],
                    "flightNumber": first_q["flight_num"],
                    "paxID": "passenger1",
                    "ptc": "ADT",
                    "withRawXML": "false",
                    "cabinClass": "F,J,W,Y",
                }
            )
        )

        page.goto(
            "https://www.expertflyer.com/sign-in?redirect_url="
            + urllib.parse.quote(first_target, safe=""),
            wait_until="domcontentloaded",
            timeout=25000,
        )
        page.wait_for_selector("#clerk-sign-in-email", timeout=15000)
        page.fill("#clerk-sign-in-email", email)
        page.fill("#clerk-sign-in-password", password)
        page.locator("button[type=submit]").first.click()
        page.wait_for_url("**/air/seat-map/results**", wait_until="commit", timeout=25000)
        page.wait_for_timeout(10000)

        for idx, q in enumerate(queries):
            if idx > 0:
                captured["body"] = ""
                target_url = (
                    "https://www.expertflyer.com/air/seat-map/results?"
                    + urllib.parse.urlencode(
                        {
                            "departingAirport": q["origin"],
                            "arrivingAirport": q["destination"],
                            "departDate": q["departure_date"],
                            "airline": q["airline"],
                            "flightNumber": q["flight_num"],
                            "paxID": "passenger1",
                            "ptc": "ADT",
                            "withRawXML": "false",
                            "cabinClass": "F,J,W,Y",
                        }
                    )
                )
                page.goto(target_url, wait_until="domcontentloaded", timeout=25000)
                page.wait_for_timeout(10000)

            parsed = parse_seatmap_payload(captured["body"])
            results.append({"query": q, "parsed": parsed})

        browser.close()

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync ExpertFlyer seat maps to standby-flight-dashboard.")
    parser.add_argument("--worker-url", default=os.environ.get("STANDBY_WORKER_URL") or DEFAULT_WORKER_URL)
    parser.add_argument("--flight", help="Optional single flight e.g. BA292")
    parser.add_argument("--origin", help="Optional origin IATA e.g. IAD")
    parser.add_argument("--destination", help="Optional destination IATA e.g. LHR")
    parser.add_argument("--date", help="Optional YYYY-MM-DD")
    args = parser.parse_args()

    email = os.environ.get("EXPERTFLYER_EMAIL", "").strip()
    password = os.environ.get("EXPERTFLYER_PASSWORD", "")
    if not email or not password:
        print("ERROR: EXPERTFLYER_EMAIL and EXPERTFLYER_PASSWORD must be set.", file=sys.stderr)
        return 1

    if args.flight and args.origin and args.destination and args.date:
        m = re.match(r"^([A-Za-z]{2})\s*(\d+)$", args.flight.strip().upper())
        if not m:
            print(f"Invalid --flight format: {args.flight}", file=sys.stderr)
            return 1
        queries = [
            {
                "flightKey": f"{m.group(1)}{m.group(2)}-{args.origin.upper()}-{args.destination.upper()}-{args.date}",
                "airline": m.group(1),
                "flight_num": m.group(2),
                "origin": args.origin.upper(),
                "destination": args.destination.upper(),
                "departure_date": args.date,
                "reason": "manual CLI query",
            }
        ]
        res = fetch_seatmaps(email, password, queries)
        print(json.dumps(res, indent=2))
        return 0

    watches_resp = http_json(f"{args.worker_url.rstrip('/')}/api/watches")
    watches = watches_resp.get("watches") or []
    queries = []
    for w in watches:
        due, hrs, reason = is_watch_due(w)
        print(f"[watch] {w['flight_key']} hrs={hrs if hrs is None else round(hrs, 2)} due={due} ({reason})")
        if not due:
            continue
        fnum = str(w.get("flight_number") or "")
        airline = str(w.get("airline") or "").upper()
        digits = re.sub(r"^[A-Z]+", "", fnum.upper())
        queries.append(
            {
                "flightKey": w["flight_key"],
                "airline": airline,
                "flight_num": digits,
                "origin": str(w["origin"]).upper(),
                "destination": str(w["destination"]).upper(),
                "departure_date": str(w["departure_date"]),
                "reason": reason,
            }
        )

    if not queries:
        print("No watched flights due for ExpertFlyer sync.")
        return 0

    fetched = fetch_seatmaps(email, password, queries)
    for item in fetched:
        q = item["query"]
        parsed = item["parsed"]
        if parsed is None:
            payload = {
                "flightKey": q["flightKey"],
                "status": "unavailable",
                "note": f"ExpertFlyer seat map unavailable ({q['reason']})",
            }
        else:
            payload = {
                "flightKey": q["flightKey"],
                "status": "ok",
                "aircraft": parsed["aircraft"],
                "cabins": parsed["cabins"],
                "note": f"ExpertFlyer seat map ({q['reason']})",
            }
        resp = http_json(f"{args.worker_url.rstrip('/')}/api/expertflyer/ingest", payload)
        print(f"[ingest] {q['flightKey']} -> {resp}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
