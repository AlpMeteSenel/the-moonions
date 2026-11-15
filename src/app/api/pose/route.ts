/**
 * Same-origin proxy for the pose tracker running next to the dashboard (Arduino UNO Q service on
 * port 7000). Server-side, so it always talks to localhost on the machine running Next.js,
 * whatever network that machine is on. Override with POSE_API_URL.
 */
export const dynamic = "force-dynamic";

const POSE_URL = process.env.POSE_API_URL ?? "http://127.0.0.1:7000/api/pose";

export async function GET() {
  try {
    const r = await fetch(POSE_URL, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch {
    return Response.json({ tracking_status: "offline", map: null, x_px: null, y_px: null, z_m: null, frame_age_ms: null, heading_deg: null, heading_source: null, imu_estimated: null }, { headers: { "cache-control": "no-store" } });
  }
}
