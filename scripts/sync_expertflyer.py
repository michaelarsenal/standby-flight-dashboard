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
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

DEFAULT_WORKER_URL = "https://standby-flight-dashboard.michaelborland71.workers.dev"
CABIN_MAP = {
    "F": "first",
    "J": "business",
    "C": "business",
    "W": "prem_econ",
    "Y": "economy",
}
AIRPORT_TZ = {
    "IAD": "America/New_York", "DCA": "America/New_York", "BWI": "America/New_York",
    "JFK": "America/New_York", "EWR": "America/New_York", "BOS": "America/New_York",
    "MIA": "America/New_York", "ATL": "America/New_York", "CLT": "America/New_York",
    "PHL": "America/New_York", "ORD": "America/Chicago", "DFW": "America/Chicago",
    "IAH": "America/Chicago", "DEN": "America/Denver", "LAX": "America/Los_Angeles",
    "SFO": "America/Los_Angeles", "SEA": "America/Los_Angeles",
    "LHR": "Europe/London", "LGW": "Europe/London", "MAN": "Europe/London",
    "EDI": "Europe/London", "DUB": "Europe/Dublin",
}


def http_json(url: str, payload: dict[str, Any] | None = None) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"User-Agent": "standby-flight-dashboard-sync/1.0"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def hours_until_departure(dep_date: str, dep_time: str | None, origin: str | None = None) -> float | None:
    if not dep_date:
        return None
    hhmm = dep_time if (dep_time and re.match(r"^\d{2}:\d{2}$", dep_time)) else "18:00"
    tz_name = AIRPORT_TZ.get((origin or "").upper())
    tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    try:
        dt = datetime.fromisoformat(f"{dep_date}T{hhmm}:00").replace(tzinfo=tz)
    except ValueError:
        return None
    return (dt.astimezone(timezone.utc) - datetime.now(timezone.utc)).total_seconds() / 3600.0


def is_watch_due(watch: dict[str, Any]) -> tuple[bool, float | None, str]:
    hrs = hours_until_departure(watch.get("departure_date", ""), watch.get("departure_time"), watch.get("origin"))
    if hrs is None:
        return False, None, "invalid date"
    if hrs < -6.0:
        return False, hrs, "departed"
    if hrs > 336.0:
        return False, hrs, ">14d out"

    updated_raw = str(watch.get("lastSeatmapAt") or watch.get("updated_at") or "").strip()
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

    # Tiered cadence based on time to departure
    if -5.0 <= hrs <= 2.0:
        return (age_mins >= 4.5), hrs, "T-2h high-freq window (5m)"
    if hrs <= 24.0:
        return (age_mins >= 14.5), hrs, "T-24h check-in window (15m)"
    if hrs <= 48.0:
        return (age_mins >= 119.0), hrs, "T-48h pre-check-in window (2h)"
    if hrs <= 72.0:
        return (age_mins >= 359.0), hrs, "T-72h medium cadence (6h)"
    return (age_mins >= 719.0), hrs, "long-range cadence (12h)"


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

    compact_sections: list[dict[str, Any]] = []
    seen_first = False
    unknown_types: dict[str, Any] = {}
    for sec in sections:
        code = str(sec.get("displayCabinCode") or sec.get("cabinCode") or "").upper()
        sec_name = str(sec.get("cabinName") or sec.get("name") or sec.get("title") or "").lower()
        if "business" in sec_name or "club" in sec_name or "upper" in sec_name:
            code = "J"
        key = CABIN_MAP.get(code)
        if not key:
            continue
        if key == "first":
            if seen_first:
                key = "business"
                code = "J"
            else:
                seen_first = True
        c_rows: list[dict[str, Any]] = []
        for row in sec.get("rows") or []:
            c_seats: list[dict[str, Any]] = []
            for s in row.get("seats") or []:
                stype = str(s.get("type") or "")
                st = str(s.get("status") or "").lower()
                slabel = str(s.get("label") or "").strip()
                has_seat_status = st in ("available", "occupied", "blocked") and bool(slabel)
                if (stype == "seat" and bool(slabel)) or has_seat_status:
                    cabins[key]["total"] += 1
                    if st == "available":
                        cabins[key]["available"] += 1
                    elif st == "occupied":
                        cabins[key]["occupied"] += 1
                    elif st == "blocked":
                        cabins[key]["blocked"] += 1
                    c_seats.append({
                        "t": "s",
                        "l": slabel,
                        "s": "a" if st == "available" else ("o" if st == "occupied" else ("b" if st == "blocked" else "?")),
                        "p": 1 if (s.get("isChargeable") or s.get("isPaidPremium")) else 0,
                    })
                else:
                    if stype not in ("aisle", "empty", "galley", "lavatory", "exit", "wing") and stype not in unknown_types:
                        unknown_types[stype] = s
                    c_seats.append({"t": stype[:1] or "e"})
            c_rows.append({
                "n": row.get("rowNumber"),
                "el": bool(row.get("exitLeft")),
                "er": bool(row.get("exitRight")),
                "w": bool(row.get("wing")),
                "seats": c_seats,
            })
        compact_sections.append({
            "cabin": key,
            "code": code,
            "cols": sec.get("columns") or [],
            "rows": c_rows,
        })

    aircraft = ""
    info = obj["seatMap"].get("info") or {}
    if isinstance(info.get("aircraft"), dict):
        aircraft = str(info["aircraft"].get("type") or info["aircraft"].get("equipmentCode") or "")

    if unknown_types:
        print(f"  [seatmap] unknown seat types for {aircraft}: {json.dumps(unknown_types)[:500]}")

    return {"cabins": cabins, "aircraft": aircraft, "seatmap": {"sections": compact_sections}}


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

        page.goto(
            "https://www.expertflyer.com/sign-in?redirect_url=%2Fair%2Fseat-map",
            wait_until="domcontentloaded",
            timeout=25000,
        )
        page.wait_for_selector("#clerk-sign-in-email", timeout=15000)
        page.fill("#clerk-sign-in-email", email)
        page.fill("#clerk-sign-in-password", password)
        page.locator("button[type=submit]").first.click()
        page.wait_for_url("**/air/seat-map**", wait_until="commit", timeout=25000)
        page.wait_for_timeout(2000)

        for q in queries:
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
            page.wait_for_timeout(8000)

            parsed = parse_seatmap_payload(captured["body"])
            results.append({"query": q, "parsed": parsed})

        browser.close()

    return results


def parse_availability_payload(raw_text: str, dep_date: str) -> list[dict[str, Any]]:
    obj = None
    for line in raw_text.splitlines():
        if '"searchResults"' in line and '"itineraries"' in line and ":" in line:
            _, rest = line.split(":", 1)
            try:
                obj = json.loads(rest)
                break
            except Exception:
                continue
    if not obj or not isinstance(obj.get("searchResults"), dict):
        return []

    flights: list[dict[str, Any]] = []
    for day in obj["searchResults"].get("departure") or []:
        d_str = str(day.get("date") or dep_date)
        itins = (day.get("data") or {}).get("itineraries") or []
        for it in itins:
            segs = it.get("segments") or []
            if len(segs) != 1:
                continue
            s = segs[0]
            airline = str(s.get("marketingAirlineCode") or "").upper()
            fnum_digits = str(s.get("flightNumber") or "").strip()
            origin = str(s.get("departureAirport") or "").upper()
            dest = str(s.get("arrivalAirport") or "").upper()
            if not (airline and fnum_digits and origin and dest):
                continue
            flight_number = f"{airline}{fnum_digits}"
            dep_dt = str(s.get("departureDateTime") or "")
            arr_dt = str(s.get("arrivalDateTime") or "")
            dep_time = dep_dt.split("T")[-1][:5] if "T" in dep_dt else "00:00"
            arr_time = arr_dt.split("T")[-1][:5] if "T" in arr_dt else "00:00"
            buckets = " ".join(
                f"{b.get('code')}{b.get('availability')}"
                for b in (s.get("bookingClassAvailability") or [])
                if b.get("code") is not None and b.get("availability") is not None
            )
            flights.append(
                {
                    "flight_key": f"{flight_number}-{origin}-{dest}-{d_str}",
                    "airline": airline,
                    "flight_number": flight_number,
                    "origin": origin,
                    "destination": dest,
                    "departure_date": d_str,
                    "departure_time": dep_time,
                    "arrival_time": arr_time,
                    "aircraft": str(s.get("airEquipType") or "Widebody"),
                    "ef_buckets": buckets,
                }
            )
    return flights


def fetch_availability(
    email: str,
    password: str,
    avail_queries: list[dict[str, str]],
) -> list[dict[str, Any]]:
    all_flights: list[dict[str, Any]] = []
    if not avail_queries:
        return all_flights

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
            if "/air/availability/results" in r.url and r.request.method == "POST":
                try:
                    txt = r.text()
                    if len(txt) > len(captured["body"]):
                        captured["body"] = txt
                except Exception:
                    pass

        page.on("response", on_resp)

        page.goto(
            "https://www.expertflyer.com/sign-in?redirect_url=%2Fair%2Favailability",
            wait_until="domcontentloaded",
            timeout=25000,
        )
        page.wait_for_selector("#clerk-sign-in-email", timeout=15000)
        page.fill("#clerk-sign-in-email", email)
        page.fill("#clerk-sign-in-password", password)
        page.locator("button[type=submit]").first.click()
        page.wait_for_url("**/air/availability**", wait_until="commit", timeout=25000)
        page.wait_for_timeout(2000)

        for q in avail_queries:
            captured["body"] = ""
            u = "https://www.expertflyer.com/air/availability/results?" + urllib.parse.urlencode(
                {
                    "origin": q["origin"],
                    "destination": q["destination"],
                    "departureDateTime": f"{q['departure_date']}T00:00",
                    "alliance": "none",
                    "airLineCodes": "",
                    "excludeCodeshares": "true",
                    "pcc": "USA (Default)",
                    "resultsDisplay": "tabbed",
                }
            )
            page.goto(u, wait_until="domcontentloaded", timeout=25000)
            page.wait_for_timeout(8000)
            all_flights.extend(parse_availability_payload(captured["body"], q["departure_date"]))

        browser.close()

    return all_flights


def run_sync_session(
    email: str,
    password: str,
    avail_queries: list[dict[str, str]],
    build_seatmap_queries: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Run availability and seat map queries in a single Clerk login session."""
    all_flights: list[dict[str, Any]] = []
    seatmap_results: list[dict[str, Any]] = []

    session_file = os.environ.get("EF_SESSION_FILE", "").strip()
    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        ctx_kwargs: dict[str, Any] = {
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
        }
        if session_file and os.path.exists(session_file):
            ctx_kwargs["storage_state"] = session_file
        ctx = browser.new_context(**ctx_kwargs)
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

        captured: dict[str, Any] = {"avail": "", "avail_status": 0, "seat": "", "seat_status": 0}

        def on_resp(r: Any) -> None:
            if r.request.method != "POST":
                return
            try:
                if "/air/availability/results" in r.url:
                    captured["avail_status"] = r.status
                    txt = r.text()
                    if len(txt) > len(captured["avail"]):
                        captured["avail"] = txt
                elif "/air/seat-map/results" in r.url:
                    captured["seat_status"] = r.status
                    txt = r.text()
                    if len(txt) > len(captured["seat"]):
                        captured["seat"] = txt
            except Exception as e:
                print(f"[on_resp] {r.url} error: {e}", file=sys.stderr)

        page.on("response", on_resp)

        def save_session() -> None:
            if not session_file:
                return
            try:
                os.makedirs(os.path.dirname(session_file), exist_ok=True)
                ctx.storage_state(path=session_file)
            except Exception as e:
                print(f"[auth] warning saving session: {e}", file=sys.stderr)

        def sign_in(redirect_path: str = "/air/availability") -> bool:
            for attempt in (1, 2):
                page.goto(
                    f"https://www.expertflyer.com/sign-in?redirect_url={urllib.parse.quote(redirect_path, safe='')}",
                    wait_until="domcontentloaded",
                    timeout=25000,
                )
                page.wait_for_selector("#clerk-sign-in-email", timeout=15000)
                page.fill("#clerk-sign-in-email", email)
                page.fill("#clerk-sign-in-password", password)
                page.wait_for_timeout(300)
                page.locator("button[type=submit]").first.click()
                for _ in range(25):
                    if "/sign-in" not in page.url:
                        break
                    page.wait_for_timeout(1000)
                page.wait_for_timeout(2000)
                print(f"[auth] attempt={attempt} post-login url={page.url}")
                if "/sign-in" not in page.url:
                    save_session()
                    return True
                try:
                    err_txt = page.locator("[role='alert'], .cl-formFieldErrorText").first.inner_text(timeout=1000)
                    if err_txt:
                        print(f"[auth] clerk message: {err_txt.strip()}")
                except Exception:
                    pass
            return False

        session_valid = False
        if session_file and os.path.exists(session_file):
            try:
                page.goto("https://www.expertflyer.com/air/availability", wait_until="domcontentloaded", timeout=25000)
                page.wait_for_timeout(1500)
                if "/sign-in" not in page.url:
                    session_valid = True
                    print(f"[auth] reused cached session url={page.url}")
            except Exception:
                pass

        if not session_valid:
            try:
                ctx.clear_cookies()
            except Exception:
                pass
            if not sign_in("/air/availability"):
                print("[auth] sign-in failed after 2 attempts; aborting session cleanly")
                browser.close()
                return all_flights, seatmap_results

        for q in avail_queries:
            captured["avail"] = ""
            captured["avail_status"] = 0
            u = "https://www.expertflyer.com/air/availability/results?" + urllib.parse.urlencode(
                {
                    "origin": q["origin"],
                    "destination": q["destination"],
                    "departureDateTime": f"{q['departure_date']}T00:00",
                    "alliance": "none",
                    "airLineCodes": "",
                    "excludeCodeshares": "true",
                    "pcc": "USA (Default)",
                    "resultsDisplay": "tabbed",
                }
            )
            try:
                page.goto(u, wait_until="domcontentloaded", timeout=25000)
                for _ in range(24):
                    if '"searchResults"' in captured["avail"] or "/sign-in" in page.url:
                        break
                    page.wait_for_timeout(500)
                if "/sign-in" in page.url:
                    print(f"[availability] {q['origin']}-{q['destination']} {q['departure_date']} session expired (redirected to sign-in); stopping")
                    break
                parsed_avail = parse_availability_payload(captured["avail"], q["departure_date"])
                if not parsed_avail:
                    print(
                        f"[availability] {q['origin']}-{q['destination']} {q['departure_date']} "
                        f"empty (status={captured['avail_status']}, bytes={len(captured['avail'])}, url={page.url})"
                    )
                all_flights.extend(parsed_avail)
            except Exception as e:
                print(f"[availability] {q['origin']}-{q['destination']} {q['departure_date']} warning: {e}", file=sys.stderr)

        seat_queries = build_seatmap_queries(all_flights)
        for q in seat_queries:
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
            parsed = None
            for attempt in (1, 2):
                captured["seat"] = ""
                captured["seat_status"] = 0
                try:
                    page.goto(target_url, wait_until="commit", timeout=35000)
                    for _ in range(32):
                        if '"seatMap"' in captured["seat"] or "/sign-in" in page.url:
                            break
                        page.wait_for_timeout(500)
                    if "/sign-in" in page.url:
                        print(f"[seatmap] {q['flightKey']} session expired (redirected to sign-in); stopping")
                        break
                    # Give a brief moment for any trailing chunks if seatMap just appeared
                    if '"seatMap"' in captured["seat"]:
                        page.wait_for_timeout(500)
                    parsed = parse_seatmap_payload(captured["seat"])
                    if parsed is not None:
                        break
                    print(
                        f"[seatmap] {q['flightKey']} attempt={attempt} unavailable "
                        f"(status={captured['seat_status']}, bytes={len(captured['seat'])}, url={page.url})"
                    )
                except Exception as e:
                    print(f"[seatmap] {q['flightKey']} attempt={attempt} warning: {e}", file=sys.stderr)
                if attempt == 1:
                    page.wait_for_timeout(2000)
            seatmap_results.append({"query": q, "parsed": parsed})

        save_session()
        browser.close()

    return all_flights, seatmap_results


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser(description="Sync ExpertFlyer seat maps to standby-flight-dashboard.")
    parser.add_argument("--worker-url", default=os.environ.get("STANDBY_WORKER_URL") or DEFAULT_WORKER_URL)
    parser.add_argument("--flight", help="Optional single flight e.g. BA292")
    parser.add_argument("--origin", help="Optional origin IATA e.g. IAD")
    parser.add_argument("--destination", help="Optional destination IATA e.g. LHR")
    parser.add_argument("--date", help="Optional YYYY-MM-DD")
    parser.add_argument("--avail", action="store_true", help="Sync Flight Availability for --origin/--destination/--date")
    args = parser.parse_args()

    email = os.environ.get("EXPERTFLYER_EMAIL", "").strip()
    password = os.environ.get("EXPERTFLYER_PASSWORD", "")
    if not email or not password:
        print("ERROR: EXPERTFLYER_EMAIL and EXPERTFLYER_PASSWORD must be set.", file=sys.stderr)
        return 1

    if args.avail and args.origin and args.destination and args.date:
        flights = fetch_availability(
            email,
            password,
            [{"origin": args.origin.upper(), "destination": args.destination.upper(), "departure_date": args.date}],
        )
        print(f"Fetched {len(flights)} direct flights from ExpertFlyer availability")
        if flights:
            resp = http_json(f"{args.worker_url.rstrip('/')}/api/expertflyer/flights", {"flights": flights})
            print("Ingested availability ->", resp)
        return 0

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

    # Sync ExpertFlyer Flight Availability for targeted search route OR default routes + watched routes
    from datetime import timedelta
    ef_origins = [x.strip().upper() for x in os.environ.get("EF_ORIGINS", "").split(",") if x.strip()]
    ef_dests = [x.strip().upper() for x in os.environ.get("EF_DESTINATIONS", "").split(",") if x.strip()]
    ef_date = os.environ.get("EF_DATE", "").strip()
    ef_mode = os.environ.get("EF_MODE", "").strip().lower()
    ef_flight_key = os.environ.get("EF_FLIGHT_KEY", "").strip().upper()
    targeted_route = bool(ef_origins and ef_dests and ef_date)

    watches_resp = http_json(f"{args.worker_url.rstrip('/')}/api/watches")
    watches = watches_resp.get("watches") or []

    avail_pairs = set()
    if ef_mode == "seatmap_only" and ef_flight_key:
        print(f"[targeted-seatmap] single flight mode for {ef_flight_key}")
    elif targeted_route:
        for o in ef_origins:
            for d in ef_dests:
                if o != d:
                    avail_pairs.add((o, d, ef_date))
        print(f"[targeted] syncing {len(avail_pairs)} route pair(s) for {ef_date} (mode={ef_mode or 'full'})")
    else:
        today_dt = datetime.now(timezone.utc)
        for off in (0, 1):
            d_str = (today_dt + timedelta(days=off)).strftime("%Y-%m-%d")
            avail_pairs.add(("WAS", "LHR", d_str))
            avail_pairs.add(("LHR", "WAS", d_str))
        for w in watches:
            if w.get("origin") and w.get("destination") and w.get("departure_date"):
                avail_pairs.add((str(w["origin"]).upper(), str(w["destination"]).upper(), str(w["departure_date"])))

    avail_queries = [{"origin": o, "destination": d, "departure_date": dt} for (o, d, dt) in sorted(avail_pairs)]

    def build_seatmap_queries(avail_flights: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if avail_flights:
            try:
                resp = http_json(f"{args.worker_url.rstrip('/')}/api/expertflyer/flights", {"flights": avail_flights})
                print(f"[availability] synced {len(avail_flights)} direct flights -> {resp}")
            except Exception as e:
                print(f"[availability] warning: {e}", file=sys.stderr)

        if ef_mode == "avail_only":
            print("[targeted] avail_only mode — skipping seat maps")
            return []

        if ef_mode == "seatmap_only" and ef_flight_key:
            m = re.match(r"^([A-Z0-9]{2})(\d+)-([A-Z]{3})-([A-Z]{3})-(\d{4}-\d{2}-\d{2})$", ef_flight_key)
            if not m:
                print(f"[targeted-seatmap] invalid flight_key: {ef_flight_key}", file=sys.stderr)
                return []
            w_match = next((w for w in watches if w.get("flight_key") == ef_flight_key), None)
            return [
                {
                    "flightKey": ef_flight_key,
                    "airline": m.group(1),
                    "flightNumber": f"{m.group(1)}{m.group(2)}",
                    "flight_num": m.group(2),
                    "origin": m.group(3),
                    "destination": m.group(4),
                    "departure_date": m.group(5),
                    "departure_time": str((w_match or {}).get("departure_time") or "18:00"),
                    "ef_buckets": str((w_match or {}).get("ef_buckets") or ""),
                    "reason": "on-demand seat map",
                }
            ]

        force_sync = os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
        queries: list[dict[str, Any]] = []
        queued_keys: set[str] = set()
        for w in ([] if targeted_route else watches):
            hrs = hours_until_departure(w.get("departure_date", ""), w.get("departure_time"), w.get("origin"))
            due = False
            reason = "invalid date"
            if hrs is not None:
                if hrs < -1.0:
                    due, reason = False, "departed"
                elif hrs > 336.0:
                    due, reason = False, ">14d out"
                elif force_sync:
                    due, reason = True, "manual Refresh EF"
                else:
                    age_mins = 9999.0
                    closed_out = False
                    try:
                        hist = http_json(f"{args.worker_url.rstrip('/')}/api/history/{urllib.parse.quote(w['flight_key'], safe='')}")
                        snaps = hist.get("snapshots") or []
                        ef_snaps = [s for s in snaps if str(s.get("raw_note") or "").startswith("ExpertFlyer")]
                        if ef_snaps:
                            last_note = str(ef_snaps[-1].get("raw_note") or "")
                            if "(preserved " in last_note or (hrs <= 1.5 and "unavailable" in last_note.lower()):
                                closed_out = True
                            last_ts = str(ef_snaps[-1].get("captured_at") or "").replace(" ", "T")
                            if not last_ts.endswith("Z") and "+" not in last_ts:
                                last_ts += "+00:00"
                            age_mins = (datetime.now(timezone.utc) - datetime.fromisoformat(last_ts)).total_seconds() / 60.0
                    except Exception:
                        pass
                    if closed_out:
                        due, reason = False, "seatmap closed"
                    elif age_mins >= 9000.0:
                        due, reason = True, "initial ExpertFlyer sync"
                    elif hrs <= 2.0:
                        due, reason = (age_mins >= 4.5), "T-2h high-freq window (5m)"
                    elif hrs <= 24.0:
                        due, reason = (age_mins >= 14.5), "T-24h check-in window (15m)"
                    elif hrs <= 48.0:
                        due, reason = (age_mins >= 119.0), "T-48h pre-check-in window (2h)"
                    elif hrs <= 72.0:
                        due, reason = (age_mins >= 359.0), "T-72h medium cadence (6h)"
                    else:
                        due, reason = (age_mins >= 719.0), "long-range cadence (12h)"
            print(f"[watch] {w['flight_key']} hrs={hrs if hrs is None else round(hrs, 2)} due={due} ({reason})")
            if not due:
                continue
            fnum = str(w.get("flight_number") or "")
            airline = str(w.get("airline") or "").upper()
            digits = re.sub(r"^[A-Z]+", "", fnum.upper())
            queued_keys.add(w["flight_key"])
            queries.append(
                {
                    "flightKey": w["flight_key"],
                    "airline": airline,
                    "flightNumber": fnum,
                    "flight_num": digits,
                    "origin": str(w["origin"]).upper(),
                    "destination": str(w["destination"]).upper(),
                    "departure_date": str(w["departure_date"]),
                    "departure_time": str(w.get("departure_time") or "18:00"),
                    "ef_buckets": str(w.get("ef_buckets") or ""),
                    "reason": reason,
                }
            )

        for af in avail_flights:
            fk = af["flight_key"]
            if fk in queued_keys:
                continue
            hrs = hours_until_departure(af["departure_date"], af.get("departure_time"), af.get("origin"))
            if hrs is None or hrs < 0.8 or hrs > (336.0 if targeted_route else 48.0):
                continue
            if not targeted_route:
                try:
                    hist = http_json(f"{args.worker_url.rstrip('/')}/api/history/{urllib.parse.quote(fk, safe='')}")
                    snaps = hist.get("snapshots") or []
                    ef_snaps = [s for s in snaps if str(s.get("raw_note") or "").startswith("ExpertFlyer")]
                    if ef_snaps:
                        last_ts = str(ef_snaps[-1].get("captured_at") or "").replace(" ", "T")
                        if not last_ts.endswith("Z") and "+" not in last_ts:
                            last_ts += "+00:00"
                        age_mins = (datetime.now(timezone.utc) - datetime.fromisoformat(last_ts)).total_seconds() / 60.0
                        if age_mins < 30.0:
                            continue
                except Exception:
                    pass
            queued_keys.add(fk)
            digits = re.sub(r"^[A-Z0-9]{2}", "", af["flight_number"].upper())
            queries.append(
                {
                    "flightKey": fk,
                    "airline": af["airline"],
                    "flightNumber": af["flight_number"],
                    "flight_num": digits,
                    "origin": af["origin"],
                    "destination": af["destination"],
                    "departure_date": af["departure_date"],
                    "departure_time": af.get("departure_time") or "18:00",
                    "ef_buckets": af.get("ef_buckets") or "",
                    "reason": "route pre-cache",
                }
            )
        return queries[:18]

    _, fetched = run_sync_session(email, password, avail_queries[:6], build_seatmap_queries)
    for item in fetched:
        q = item["query"]
        parsed = item["parsed"]
        if parsed is None:
            payload = {
                "flightKey": q["flightKey"],
                "airline": q["airline"],
                "flightNumber": q["flightNumber"],
                "origin": q["origin"],
                "destination": q["destination"],
                "departureDate": q["departure_date"],
                "departureTime": q.get("departure_time") or "18:00",
                "status": "unavailable",
                "note": f"ExpertFlyer seat map unavailable ({q['reason']})",
            }
        else:
            payload = {
                "flightKey": q["flightKey"],
                "airline": q["airline"],
                "flightNumber": q["flightNumber"],
                "origin": q["origin"],
                "destination": q["destination"],
                "departureDate": q["departure_date"],
                "departureTime": q.get("departure_time") or "18:00",
                "efBuckets": q.get("ef_buckets") or "",
                "status": "ok",
                "aircraft": parsed["aircraft"],
                "cabins": parsed["cabins"],
                "seatmap": parsed.get("seatmap"),
                "note": f"ExpertFlyer seat map ({q['reason']})",
            }
        resp = http_json(f"{args.worker_url.rstrip('/')}/api/expertflyer/ingest", payload)
        print(f"[ingest] {q['flightKey']} -> {resp}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
