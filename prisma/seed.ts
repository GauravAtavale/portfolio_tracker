import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_TICKERS = [
  { symbol: "NVDA",  note: "AI/GPU - high beta, earnings volatile" },
  { symbol: "TSLA",  note: "EV - reacts strongly to Musk news" },
  { symbol: "META",  note: "Ad revenue sensitive, big earnings moves" },
  { symbol: "AMD",   note: "Semiconductor, tracks NVDA with lag" },
  { symbol: "PLTR",  note: "AI/gov contracts - sentiment driven" },
  { symbol: "SMCI",  note: "Server infra - extreme volatility" },
  { symbol: "COIN",  note: "Crypto proxy - 2-3x BTC daily moves" },
  { symbol: "MSTR",  note: "Bitcoin treasury play" },
  { symbol: "RIVN",  note: "EV startup - news/delivery driven" },
  { symbol: "SHOP",  note: "E-commerce, reacts to consumer data" },
  { symbol: "SNOW",  note: "Cloud data - expensive, gap-prone" },
  { symbol: "CRWD",  note: "Cybersecurity - incident sensitive" },
  { symbol: "RBLX",  note: "Gaming/metaverse - DAU driven" },
  { symbol: "HOOD",  note: "Retail brokerage - tracks sentiment" },
  { symbol: "SOFI",  note: "Fintech - rate policy sensitive" },
  { symbol: "NIO",   note: "Chinese EV - geopolitical + tariff risk" },
  { symbol: "DKNG",  note: "Sports betting - regulation sensitive" },
  { symbol: "IONQ",  note: "Quantum computing - hype/news driven" },
  { symbol: "UPST",  note: "AI lending - credit cycle volatile" },
  { symbol: "SOUN",  note: "AI voice - small cap, large swings" },
];

async function main() {
  console.log("Seeding watchlist tickers...");
  for (const t of SEED_TICKERS) {
    await prisma.watchlistTicker.upsert({
      where:  { symbol: t.symbol },
      update: {},           // don't overwrite if already exists
      create: t,
    });
  }
  console.log(`✅ Seeded ${SEED_TICKERS.length} tickers.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());