import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { BotanicalAggregatorService } from '../services/BotanicalAggregatorService';
import { CacheStore } from '../cache/CacheStore';
import { createAggregatorRouter } from '../api/router';

const SAMPLE_DWCA_TSV = [
  'taxonID\tscientificName\tacceptedNameUsage\tfamily\tgenus\tscientificNameAuthorship\ttaxonRank\tvernacularNameEn\tvernacularNameFr\tlocality\toccurrenceStatus',
  '1201\tAcer rubrum\tAcer rubrum\tSapindaceae\tAcer\tL.\tspecies\tRed Maple\tÉrable rouge\tON\tnative',
  '1201\tAcer rubrum\tAcer rubrum\tSapindaceae\tAcer\tL.\tspecies\tRed Maple\tÉrable rouge\tQC\tnative',
  '1202\tPicea glauca\tPicea glauca\tPinaceae\tPicea\t(Moench) Voss\tspecies\tWhite Spruce\tÉpinette blanche\tAB\tnative',
  '1203\tPilea peperomioides\tPilea peperomioides\tUrticaceae\tPilea\tDiels\tspecies\tChinese Money Plant\tPlante à monnaie chinoise\t\t',
].join('\n');

const SAMPLE_BGCI_TRY_CSV = [
  'species,bgci_id,country_endemic,iucn_status,try_species_id,wood_density,leaf_traits,hardiness_zone,max_height_cm',
  'Acer rubrum,BGCI-001,false,LC,TRY-101,0.54 g/cm3,Palmate 3-5 lobed,3a,2500',
  'Picea glauca,BGCI-002,false,LC,TRY-102,0.40 g/cm3,Glaucous needles,1a,3000',
  'Pilea peperomioides,BGCI-003,true,LC,TRY-103,,Peltate orbicular,10a,35',
].join('\n');

const SAMPLE_OTTAWA_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-75.6972, 45.4215] },
      properties: { SPECIES: 'Acer rubrum', GENUS: 'Acer', COMMON_NAME: 'Red Maple', DBH: 34.5, WARD: 'Somerset' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-75.689, 45.428] },
      properties: { SPECIES: 'Acer rubrum', GENUS: 'Acer', COMMON_NAME: 'Red Maple', DBH: 41.5, WARD: 'Rideau-Vanier' },
    },
  ],
};

const SAMPLE_MONTREAL_CSV = [
  'Essence_latin,Essence_genre,Essence_fr,DHP,Latitude,Longitude,Arrondissement',
  'Picea glauca,Picea,Épinette blanche,28.0,45.5017,-73.5673,Ville-Marie',
].join('\n');

const createMockedService = () => {
  const cache = new CacheStore(':memory:');
  const service = new BotanicalAggregatorService(cache);
  return { cache, service };
};

test('Authority-aware merge preserves higher-authority POWO/VASCAN taxonomy over Horticultural/Municipal', async () => {
  const { service } = createMockedService();

  const merged = service.mergeContributions('Acer rubrum', [
    {
      provider: service.horticultural, // authorityRank 60
      data: {
        scientificName: 'Acer rubrum hort.',
        family: 'Aceraceae', // Outdated family name from low-authority source
        genus: 'AcerWrong',
        ecologicalTraits: { light: ['Full Sun', 'Partial Shade'], soilPreferences: ['Loam'], associatedPests: [], waterNeeds: 'Frequent' },
        cultivation: { sunlight: ['Full Sun'], soilType: ['Loam'], cultivars: ['October Glory'], description: 'Ornamental shade tree' },
        sourceIds: { perenual: 888 },
      },
    },
    {
      provider: service.powo, // authorityRank 100
      data: {
        scientificName: 'Acer rubrum',
        canonicalName: 'Acer rubrum',
        authority: 'L.',
        family: 'Sapindaceae', // Authoritative APG IV family
        genus: 'Acer',
        specimenType: 'TREE',
        synonyms: ['Rufacer rubrum'],
        distribution: { canadianProvinces: {}, countriesNative: ['Canada', 'United States'], countriesIntroduced: [], sampleCoordinates: [] },
        sourceIds: { powo: 'urn:lsid:ipni.org:names:781492-1' },
      },
    },
    {
      provider: service.vascan, // authorityRank 95
      data: {
        scientificName: 'Acer rubrum',
        canonicalName: 'Acer rubrum',
        family: 'Sapindaceae',
        genus: 'Acer',
        specimenType: 'TREE',
        commonNames: { en: ['Red Maple'], fr: ['Érable rouge'] },
        distribution: { canadianProvinces: { ON: 'native', QC: 'native', NS: 'native' }, countriesNative: ['Canada'], countriesIntroduced: [], sampleCoordinates: [] },
        sourceIds: { vascan: 1201 },
      },
    },
  ]);

  assert.equal(merged.scientificName, 'Acer rubrum');
  assert.equal(merged.family, 'Sapindaceae');
  assert.equal(merged.genus, 'Acer');
  assert.equal(merged.provenance.family.provider, 'POWO');
  assert.equal(merged.provenance.family.authorityRank, 100);
  assert.equal(merged.specimenType, 'TREE');
  assert.equal(merged.ecologicalTraits.waterNeeds, 'Frequent');
  assert.deepEqual(merged.commonNames.fr, ['Érable rouge']);
  assert.equal(merged.distribution.canadianProvinces.ON, 'native');
  assert.equal(merged.sourceIds.powo, 'urn:lsid:ipni.org:names:781492-1');
  assert.equal(merged.sourceIds.vascan, 1201);
  assert.equal(merged.sourceIds.perenual, 888);
});

test('Importers (DwC-A, BGCI/TRY CSV, Municipal GeoJSON & CSV) populate providers and aggregate diverse species', async () => {
  const { service } = createMockedService();

  const dwcaCount = await service.vascan.syncBulk(SAMPLE_DWCA_TSV);
  assert.equal(dwcaCount, 3);

  const traitCount = await service.bgciTry.syncBulk(SAMPLE_BGCI_TRY_CSV);
  assert.equal(traitCount, 3);

  const ottawaCount = await service.municipal.syncBulk({
    format: 'geojson',
    preset: 'ottawa',
    data: SAMPLE_OTTAWA_GEOJSON,
  });
  assert.equal(ottawaCount, 2);

  const montrealCount = await service.municipal.syncBulk({
    format: 'csv',
    preset: 'montreal',
    data: SAMPLE_MONTREAL_CSV,
  });
  assert.equal(montrealCount, 1);

  // Stub network calls so tests are deterministic and offline-safe
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('gbif.org/v1/species/match')) {
      if (url.includes('Solanum')) {
        return new Response(JSON.stringify({ usageKey: 2930137 }), { status: 200 });
      }
      if (url.includes('Pilea')) {
        return new Response(JSON.stringify({ usageKey: 5519621 }), { status: 200 });
      }
      if (url.includes('Picea')) {
        return new Response(JSON.stringify({ usageKey: 5284884 }), { status: 200 });
      }
      return new Response(JSON.stringify({ usageKey: 3189883 }), { status: 200 });
    }
    if (url.includes('gbif.org/v1/species/3189883')) {
      if (url.includes('iucnRedListCategory')) return new Response(JSON.stringify({ category: 'LC' }), { status: 200 });
      return new Response(JSON.stringify({ canonicalName: 'Acer rubrum', family: 'Sapindaceae', genus: 'Acer', kingdom: 'Plantae' }), { status: 200 });
    }
    if (url.includes('gbif.org/v1/species/5284884')) {
      if (url.includes('iucnRedListCategory')) return new Response(JSON.stringify({ category: 'LC' }), { status: 200 });
      return new Response(JSON.stringify({ canonicalName: 'Picea glauca', family: 'Pinaceae', genus: 'Picea', kingdom: 'Plantae' }), { status: 200 });
    }
    if (url.includes('gbif.org/v1/species/2930137')) {
      return new Response(JSON.stringify({ canonicalName: 'Solanum lycopersicum', family: 'Solanaceae', genus: 'Solanum', kingdom: 'Plantae' }), { status: 200 });
    }
    if (url.includes('gbif.org/v1/species/5519621')) {
      return new Response(JSON.stringify({ canonicalName: 'Pilea peperomioides', family: 'Urticaceae', genus: 'Pilea', kingdom: 'Plantae' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  try {
    const acer = await service.aggregateByName('Acer rubrum');
    assert.equal(acer.canonicalName, 'Acer rubrum');
    assert.equal(acer.specimenType, 'TREE');
    assert.equal(acer.ecologicalTraits.canadianHardinessZone, '3a');
    assert.equal(acer.municipalSummary?.totalRecordedTrees, 2);
    assert.equal(acer.municipalSummary?.avgDbhCm, 38);
    assert.equal(acer.sourceIds.nrcanTidcf, 'TIDCF-ACRU');
    assert.equal(acer.sourceIds.bgci, 'BGCI-001');

    const picea = await service.aggregateByName('Picea glauca');
    assert.equal(picea.canonicalName, 'Picea glauca');
    assert.equal(picea.specimenType, 'TREE');
    assert.equal(picea.municipalSummary?.municipalities[0], 'Montreal');
    assert.ok(picea.ecologicalTraits.associatedPests.some(p => p.includes('Spruce Budworm')));

    const solanum = await service.aggregateByName('Solanum lycopersicum');
    assert.equal(solanum.canonicalName, 'Solanum lycopersicum');
    assert.equal(solanum.family, 'Solanaceae');
    assert.equal(solanum.sourceIds.usdaSymbol, 'SOLY2');

    const pilea = await service.aggregateByName('Pilea peperomioides');
    assert.equal(pilea.canonicalName, 'Pilea peperomioides');
    assert.equal(pilea.family, 'Urticaceae');
    assert.equal(pilea.conservation.bgciCountryEndemic, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Rate-limit retry and REST API router endpoints work end-to-end', async () => {
  const { service } = createMockedService();
  await service.bgciTry.syncBulk(SAMPLE_BGCI_TRY_CSV);

  let attempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('gbif.org/v1/species/match')) {
      attempts++;
      if (attempts === 1) return new Response('Rate limited', { status: 429 });
      return new Response(JSON.stringify({ usageKey: 3189883 }), { status: 200 });
    }
    if (url.includes('gbif.org/v1/species/3189883')) {
      return new Response(JSON.stringify({ canonicalName: 'Acer rubrum', family: 'Sapindaceae', genus: 'Acer' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;

  const app = express();
  app.use(express.json());
  app.use('/api/aggregator', createAggregatorRouter(service));

  const server = app.listen(0);
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}/api/aggregator`;

  try {
    // Use originalFetch for localhost HTTP call, while provider fetch uses mocked fetch
    const res = await originalFetch(`${baseUrl}/species?q=Acer%20rubrum`);
    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.canonicalName, 'Acer rubrum');
    assert.ok(attempts >= 2, 'Should retry on 429 rate-limit');

    const statsRes = await originalFetch(`${baseUrl}/cache/stats`);
    assert.equal(statsRes.status, 200);
    const statsJson: any = await statsRes.json();
    assert.ok(statsJson.memoryEntries >= 1);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});
