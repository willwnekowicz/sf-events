import { db } from "@/db";
import { geocodeCache } from "@/db/schema";
import { eq } from "drizzle-orm";

const HOME_LAT = 37.7725;
const HOME_LNG = -122.4175;
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "sf-events-dashboard/1.0";

export function computeDistanceMiles(lat: number, lng: number): number {
  const R = 3959;
  const dLat = toRad(lat - HOME_LAT);
  const dLng = toRad(lng - HOME_LNG);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(HOME_LAT)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const cached = await db.select().from(geocodeCache).where(eq(geocodeCache.address, address)).limit(1);
  if (cached.length > 0) {
    return { lat: cached[0].lat, lng: cached[0].lng };
  }

  await new Promise((r) => setTimeout(r, 1100));

  const params = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1",
    countrycodes: "us",
  });

  const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.length) return null;

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);

  await db.insert(geocodeCache).values({ address, lat, lng }).onConflictDoNothing();

  return { lat, lng };
}
