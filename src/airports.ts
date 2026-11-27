const CITY_COTERMINALS: Record<string, string[]> = {
  WAS: ["IAD", "BWI", "DCA"],
  LON: ["LHR", "LGW", "LCY"],
  NYC: ["JFK", "EWR", "LGA"],
  CHI: ["ORD", "MDW"],
  LAX: ["LAX", "BUR", "SNA", "ONT"],
  SFO: ["SFO", "OAK", "SJC"],
  MIA: ["MIA", "FLL"],
  DFW: ["DFW", "DAL"],
  HOU: ["IAH", "HOU"],
  PAR: ["CDG", "ORY"],
  TYO: ["HND", "NRT"],
  MIL: ["MXP", "LIN"],
};

export function expandAirportInput(raw: string): string[] {
  const tokens = raw
    .toUpperCase()
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => /^[A-Z]{3}$/.test(t));

  const expanded: string[] = [];
  for (const code of tokens) {
    const group = CITY_COTERMINALS[code];
    if (group) {
      for (const item of group) {
        if (!expanded.includes(item)) expanded.push(item);
      }
    } else if (!expanded.includes(code)) {
      expanded.push(code);
    }
  }
  return expanded;
}

export function buildFlightKey(
  airline: string,
  flightNumber: string,
  origin: string,
  destination: string,
  departureDate: string
): string {
  const code = airline.toUpperCase();
  const cleanNum = flightNumber.replace(/\s+/g, "").toUpperCase();
  const fullNum = cleanNum.startsWith(code) ? cleanNum : `${code}${cleanNum}`;
  return `${fullNum}-${origin.toUpperCase()}-${destination.toUpperCase()}-${departureDate}`;
}
