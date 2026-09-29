import { fetchExchangeRates } from "@/lib/rates";

/** Proxied rather than called from the browser so the dashboard, the public
 * catalog and every open tab share one cached copy of the day's rates. */
export async function GET() {
  return Response.json(await fetchExchangeRates());
}
