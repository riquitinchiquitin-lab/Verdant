import { BotanicalAggregatorService } from '../services/BotanicalAggregatorService';

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.error('Usage: npx tsx aggregator/api/cli.ts "<species or common name>"');
    process.exit(1);
  }

  const service = new BotanicalAggregatorService();
  const result = await service.aggregateByName(query);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
