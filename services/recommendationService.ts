import { Task, InventoryItem, Plant } from '../types';

export interface Recommendation {
  item: InventoryItem;
  reason: string;
}

export const getRecommendationsForTask = (
  task: Task,
  inventory: InventoryItem[],
  plants: Plant[]
): Recommendation[] => {
  const recommendations: Recommendation[] = [];
  const taskType = task.type || 'GENERAL';
  const taskTitle = (task.title.en || '').toLowerCase();
  const taskDesc = (task.description?.en || '').toLowerCase();

  // 1. Match by Task Type
  if (taskType === 'FERTILIZE') {
    const fertilisers = inventory.filter(
      item => item.category === 'fertiliser' || (item.category === 'custom-mix' && item.mixType === 'fertiliser')
    );
    fertilisers.forEach(item => {
      recommendations.push({ item, reason: 'Recommended for fertilizing tasks.' });
    });
  } else if (taskType === 'REPOT') {
    const pots = inventory.filter(item => item.category === 'pots');
    const soils = inventory.filter(item => item.category === 'soil' || (item.category === 'custom-mix' && item.mixType === 'soil'));
    
    pots.forEach(item => {
      recommendations.push({ item, reason: 'Recommended for repotting tasks.' });
    });
    soils.forEach(item => {
      recommendations.push({ item, reason: 'Recommended for repotting tasks.' });
    });
  } else if (taskType === 'PRUNE') {
    const tools = inventory.filter(item => item.category === 'tools');
    tools.forEach(item => {
      recommendations.push({ item, reason: 'Recommended for pruning tasks.' });
    });
  }

  // 2. Keyword matching for GENERAL or other tasks
  const combinedText = (taskTitle + ' ' + taskDesc).toLowerCase();

  if (combinedText.includes('pest') || combinedText.includes('insect') || combinedText.includes('bug') || combinedText.includes('fungus')) {
    const pesticides = inventory.filter(
      item => item.category === 'insecticide' || item.category === 'fungicide' || item.category === 'pesticide' || (item.category === 'custom-mix' && (item.mixType === 'insecticide' || item.mixType === 'fungicide' || item.mixType === 'pesticide'))
    );
    pesticides.forEach(item => {
      recommendations.push({ item, reason: 'Recommended for pest or disease control.' });
    });
  }

  if (combinedText.includes('soil') || combinedText.includes('pot') || combinedText.includes('repot')) {
    const soils = inventory.filter(item => item.category === 'soil' || (item.category === 'custom-mix' && item.mixType === 'soil'));
    const pots = inventory.filter(item => item.category === 'pots');
    
    soils.forEach(item => recommendations.push({ item, reason: 'Recommended for soil-related tasks.' }));
    pots.forEach(item => recommendations.push({ item, reason: 'Recommended for potting-related tasks.' }));
  }

  if (combinedText.includes('fertilize') || combinedText.includes('feed') || combinedText.includes('nutrient')) {
    const fertilisers = inventory.filter(
      item => item.category === 'fertiliser' || (item.category === 'custom-mix' && item.mixType === 'fertiliser')
    );
    fertilisers.forEach(item => {
      recommendations.push({ item, reason: 'Recommended for feeding tasks.' });
    });
  }

  if (combinedText.includes('tool') || combinedText.includes('cut') || combinedText.includes('prune')) {
    const tools = inventory.filter(item => item.category === 'tools');
    tools.forEach(item => {
      recommendations.push({ item, reason: 'Recommended tools for this task.' });
    });
  }

  if (combinedText.includes('seed') || combinedText.includes('plant')) {
    const seeds = inventory.filter(item => item.category === 'seeds');
    seeds.forEach(item => {
      recommendations.push({ item, reason: 'Recommended for seeding tasks.' });
    });
  }

  // 3. Filter by compatibility if plantIds are present
  if (task.plantIds && task.plantIds.length > 0) {
    const taskPlants = plants.filter(p => task.plantIds.includes(p.id));
    
    // If we have multiple recommendations, we could prioritize those compatible with the plants
    // For now, let's just return all relevant ones.
    // In a more advanced version, we'd check item.compatibility against plant species/genus.
  }

  // Remove duplicates (by item ID)
  const uniqueRecommendations: Recommendation[] = [];
  const seenIds = new Set<string>();
  
  recommendations.forEach(rec => {
    if (!seenIds.has(rec.item.id)) {
      uniqueRecommendations.push(rec);
      seenIds.add(rec.item.id);
    }
  });

  return uniqueRecommendations;
};
