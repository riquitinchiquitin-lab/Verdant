import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlantTree } from '../../utils/botanicalCategory';
import { Plant } from '../../types';

test('isPlantTree authoritatively classifies true botanical trees', () => {
  const testCases: Partial<Plant>[] = [
    { species: 'Acer rubrum', nickname: { en: 'Red Maple' }, genus: 'Acer', family: 'Sapindaceae', maxHeight: 2500 },
    { species: 'Picea glauca', nickname: { en: 'White Spruce' }, genus: 'Picea', family: 'Pinaceae', maxHeight: 3000 },
    { species: 'Ficus lyrata', nickname: { en: 'Fiddle Leaf Fig' }, genus: 'Ficus', family: 'Moraceae', growthHabit: { en: 'Tree' } },
    { species: 'Ficus elastica', nickname: { en: 'Rubber Tree' }, genus: 'Ficus', family: 'Moraceae' },
    { species: 'Ficus benjamina', nickname: { en: 'Weeping Fig' }, genus: 'Ficus', family: 'Moraceae' },
    { species: 'Olea europaea', nickname: { en: 'Olive Tree' }, genus: 'Olea', family: 'Oleaceae', maxHeight: 800 },
    { species: 'Citrus limon', nickname: { en: 'Meyer Lemon' }, genus: 'Citrus', family: 'Rutaceae', maxHeight: 400 },
    { species: 'Pachira aquatica', nickname: { en: 'Guiana Chestnut' }, genus: 'Pachira', family: 'Malvaceae' },
    { species: 'Quercus alba', nickname: { en: 'White Oak' }, genus: 'Quercus', family: 'Fagaceae', maxHeight: 3000 },
    { species: 'Dracaena draco', nickname: { en: 'Canary Islands Dragon Tree' }, genus: 'Dracaena', family: 'Asparagaceae' },
    { species: 'Phoenix dactylifera', nickname: { en: 'Date Palm' }, genus: 'Phoenix', family: 'Arecaceae', maxHeight: 2000 },
    { species: 'Dicksonia antarctica', nickname: { en: 'Soft Tree Fern' }, genus: 'Dicksonia', family: 'Dicksoniaceae' },
    { species: 'Juniperus chinensis', nickname: { en: 'Shimpaku Bonsai' }, category: { en: 'Bonsai' } },
    { species: 'Unknown Plant', nickname: { en: 'My Specimen' }, specimenType: 'TREE' }
  ];

  for (const tc of testCases) {
    assert.equal(isPlantTree(tc), true, `Expected ${tc.species || tc.nickname?.en} to be classified as a tree`);
  }
});

test('isPlantTree strictly rejects false-positive non-tree flora', () => {
  const nonTrees: Partial<Plant>[] = [
    // Vines and climbers with 'fig' or 'tree' in colloquial name
    { species: 'Ficus pumila', nickname: { en: 'Creeping Fig' }, genus: 'Ficus', family: 'Moraceae' },
    // Aroids with 'tree' in common name
    { species: 'Philodendron bipinnatifidum', nickname: { en: 'Tree Philodendron' }, genus: 'Philodendron', family: 'Araceae' },
    { species: 'Thaumatophyllum bipinnatifidum', nickname: { en: 'Lacy Tree Philodendron' }, family: 'Araceae' },
    // Succulents and succulent shrubs
    { species: 'Crassula ovata', nickname: { en: 'Jade Tree' }, genus: 'Crassula', family: 'Crassulaceae', maxHeight: 120 },
    { species: 'Euphorbia tirucalli', nickname: { en: 'Pencil Tree' }, genus: 'Euphorbia', family: 'Euphorbiaceae' },
    { species: 'Euphorbia trigona', nickname: { en: 'African Milk Tree' }, genus: 'Euphorbia', family: 'Euphorbiaceae' },
    // Aroids & Herbs with money/herbaceous nicknames
    { species: 'Pilea peperomioides', nickname: { en: 'Chinese Money Plant' }, family: 'Urticaceae', maxHeight: 35 },
    { species: 'Monstera deliciosa', nickname: { en: 'Swiss Cheese Plant' }, family: 'Araceae', maxHeight: 250 },
    { species: 'Epipremnum aureum', nickname: { en: 'Golden Pothos' }, family: 'Araceae' },
    { species: 'Sansevieria trifasciata', nickname: { en: 'Snake Plant' }, family: 'Asparagaceae', maxHeight: 90 },
    { species: 'Begonia maculata', nickname: { en: 'Polka Dot Begonia' }, family: 'Begoniaceae', maxHeight: 80 },
    // Height under 150cm without tree traits
    { species: 'Ocimum basilicum', nickname: { en: 'Sweet Basil' }, family: 'Lamiaceae', maxHeight: 50 },
    // Explicit admin override: even if species is naturally a tree, specimenType: 'PLANT' overrides it
    { species: 'Acer rubrum', nickname: { en: 'Bonsai Seedling' }, specimenType: 'PLANT' }
  ];

  for (const tc of nonTrees) {
    assert.equal(isPlantTree(tc), false, `Expected ${tc.species || tc.nickname?.en} to NOT be classified as a tree`);
  }
});
