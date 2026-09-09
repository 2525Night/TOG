import {
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const SNAPSHOT_KEY = "ISRAEL_MARKET_OVERVIEW";
const CACHE_MS = 6 * 60 * 60 * 1_000;
const USER_AGENT = "MoneyTail5/5.0 market-data";

export type IsraelMarketSnapshot = {
  fetchedAt: string;
  policyRate: {
    percent: number;
    observedAt: string;
    sourceName: "בנק ישראל";
    sourceUrl: string;
  } | null;
  cpi: {
    indexValue: number;
    monthlyChangePct: number;
    annualChangePct: number;
    periodHe: string;
    observedAt: string;
    sourceName: "הלשכה המרכזית לסטטיסטיקה";
    sourceUrl: string;
  } | null;
  exchangeRates: Array<{
    currency: "USD" | "EUR";
    ilsRate: number;
    unit: number;
    dailyChangePct: number;
    observedAt: string;
    sourceName: "בנק ישראל";
    sourceUrl: string;
  }>;
  unavailableSources: string[];
};

@Injectable()
export class MarketDataService {
  constructor(private readonly prisma: PrismaService) {}

  async current(force = false): Promise<IsraelMarketSnapshot> {
    const cached = await this.prisma.marketDataSnapshot.findUnique({
      where: { key: SNAPSHOT_KEY },
    });
    if (
      !force &&
      cached &&
      Date.now() - cached.fetchedAt.getTime() < CACHE_MS
    ) {
      return parseSnapshot(cached.payloadJson);
    }

    const [rate, cpi, exchange] = await Promise.allSettled([
      this.fetchPolicyRate(),
      this.fetchCpi(),
      this.fetchExchangeRates(),
    ]);
    const snapshot: IsraelMarketSnapshot = {
      fetchedAt: new Date().toISOString(),
      policyRate: rate.status === "fulfilled" ? rate.value : null,
      cpi: cpi.status === "fulfilled" ? cpi.value : null,
      exchangeRates:
        exchange.status === "fulfilled" ? exchange.value : [],
      unavailableSources: [
        ...(rate.status === "rejected" ? ["ריבית בנק ישראל"] : []),
        ...(cpi.status === "rejected" ? ["מדד המחירים לצרכן"] : []),
        ...(exchange.status === "rejected" ? ["שערי מטבע"] : []),
      ],
    };

    if (
      !snapshot.policyRate &&
      !snapshot.cpi &&
      snapshot.exchangeRates.length === 0
    ) {
      if (cached) return parseSnapshot(cached.payloadJson);
      throw new ServiceUnavailableException(
        "מקורות השוק הרשמיים אינם זמינים כרגע",
      );
    }

    const observedAt = latestObservation(snapshot) ?? new Date();
    await this.prisma.marketDataSnapshot.upsert({
      where: { key: SNAPSHOT_KEY },
      create: {
        key: SNAPSHOT_KEY,
        payloadJson: JSON.stringify(snapshot),
        observedAt,
        fetchedAt: new Date(snapshot.fetchedAt),
      },
      update: {
        payloadJson: JSON.stringify(snapshot),
        observedAt,
        fetchedAt: new Date(snapshot.fetchedAt),
      },
    });
    return snapshot;
  }

  private async fetchPolicyRate() {
    const sourceUrl =
      "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/BR/1.0/MNT_RIB_BOI_D?format=sdmx-json&lastNObservations=2";
    const body = await fetchJson<{
      data?: {
        dataSets?: Array<{
          series?: Record<
            string,
            { observations?: Record<string, [string | number]> }
          >;
        }>;
        structure?: {
          dimensions?: {
            observation?: Array<{
              values?: Array<{ id?: string }>;
            }>;
          };
        };
      };
    }>(sourceUrl);
    const series = Object.values(
      body.data?.dataSets?.[0]?.series || {},
    )[0];
    const observations = Object.entries(series?.observations || {});
    const latest = observations.at(-1);
    const dates =
      body.data?.structure?.dimensions?.observation?.[0]?.values || [];
    const percent = Number(latest?.[1]?.[0]);
    const observedAt = dates[Number(latest?.[0] || 0)]?.id;
    if (!Number.isFinite(percent) || !observedAt) throw new Error("invalid");
    return {
      percent,
      observedAt,
      sourceName: "בנק ישראל" as const,
      sourceUrl,
    };
  }

  private async fetchCpi() {
    const sourceUrl =
      "https://api.cbs.gov.il/index/data/price?id=120010&format=json&last=3";
    const body = await fetchJson<{
      month?: Array<{
        date?: Array<{
          year?: number;
          month?: number;
          monthDesc?: string;
          percent?: number;
          percentYear?: number;
          currBase?: { value?: number };
        }>;
      }>;
    }>(sourceUrl);
    const latest = body.month?.[0]?.date?.[0];
    const indexValue = Number(latest?.currBase?.value);
    const monthlyChangePct = Number(latest?.percent);
    const annualChangePct = Number(latest?.percentYear);
    if (
      !latest?.year ||
      !latest.month ||
      !Number.isFinite(indexValue) ||
      !Number.isFinite(monthlyChangePct) ||
      !Number.isFinite(annualChangePct)
    ) {
      throw new Error("invalid");
    }
    return {
      indexValue,
      monthlyChangePct,
      annualChangePct,
      periodHe: `${latest.monthDesc || latest.month}/${latest.year}`,
      observedAt: `${latest.year}-${String(latest.month).padStart(2, "0")}-01`,
      sourceName: "הלשכה המרכזית לסטטיסטיקה" as const,
      sourceUrl,
    };
  }

  private async fetchExchangeRates() {
    const sourceUrl = "https://www.boi.org.il/PublicApi/GetExchangeRates";
    const body = await fetchJson<{
      exchangeRates?: Array<{
        key?: string;
        currentExchangeRate?: number;
        currentChange?: number;
        unit?: number;
        lastUpdate?: string;
      }>;
    }>(sourceUrl);
    return (body.exchangeRates || [])
      .filter(
        (rate): rate is typeof rate & { key: "USD" | "EUR" } =>
          rate.key === "USD" || rate.key === "EUR",
      )
      .map((rate) => ({
        currency: rate.key,
        ilsRate: Number(rate.currentExchangeRate),
        unit: Number(rate.unit || 1),
        dailyChangePct: Number(rate.currentChange || 0),
        observedAt: rate.lastUpdate || new Date().toISOString(),
        sourceName: "בנק ישראל" as const,
        sourceUrl,
      }))
      .filter((rate) => Number.isFinite(rate.ilsRate));
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`source ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function parseSnapshot(value: string): IsraelMarketSnapshot {
  try {
    return JSON.parse(value) as IsraelMarketSnapshot;
  } catch {
    throw new ServiceUnavailableException("נתוני השוק השמורים אינם תקינים");
  }
}

function latestObservation(snapshot: IsraelMarketSnapshot) {
  const dates = [
    snapshot.policyRate?.observedAt,
    snapshot.cpi?.observedAt,
    ...snapshot.exchangeRates.map((rate) => rate.observedAt),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  return dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
}
