import { Plant, InventoryItem, LocalizedArray, LocalizedString } from '../types';

const getAllStrings = (la?: LocalizedArray | string[] | null): string[] => {
  if (!la) return [];
  if (Array.isArray(la)) return la;
  return Object.values(la).flat().filter(v => typeof v === 'string') as string[];
};

const getLocalizedValue = (ls?: LocalizedString | string | null): string => {
    if (!ls) return '';
    if (typeof ls === 'string') return ls;
    return Object.values(ls).find(v => typeof v === 'string') || '';
};

/**
 * Checks if an inventory item is compatible with a specific plant.
 * Compatibility can be based on:
 * 1. Explicit species/family match in item.compatibility
 * 2. Soil type match for soil items
 * 3. General category rules (e.g., all fertilisers are somewhat compatible, but some are specific)
 */
export const checkCompatibility = (plant: Plant, item: InventoryItem): boolean => {
  const compatibilityTags = getAllStrings(item.compatibility);
  // 1. Explicit compatibility tags
  if (compatibilityTags.length > 0) {
    const isCompatible = compatibilityTags.some(tag => {
      const t = tag.toLowerCase();
      const plantCategory = getLocalizedValue(plant.category).toLowerCase();
      const plantNickname = getLocalizedValue(plant.nickname).toLowerCase();
      
      return (
        plant.species.toLowerCase().includes(t) ||
        t.includes(plant.species.toLowerCase()) ||
        (plant.family && plant.family.toLowerCase().includes(t)) ||
        (plant.genus && plant.genus.toLowerCase().includes(t)) ||
        plantCategory.includes(t) ||
        plantNickname.includes(t)
      );
    });
    if (isCompatible) return true;
  }

  // 2. Soil compatibility
  const soilTypes = getAllStrings(item.soilTypes);
  if (item.category === 'soil' && soilTypes.length > 0) {
    // If plant has specific soil requirements or if the item matches plant's characteristics
    // This is a bit more complex, but we can do a basic check
    const isSoilCompatible = soilTypes.some(type => {
      const t = type.toLowerCase();
      const categoryMatch = plant.category && typeof plant.category === 'object' 
        ? Object.values(plant.category).some(val => typeof val === 'string' && val.toLowerCase().includes(t))
        : false;
      return (
        plant.species.toLowerCase().includes(t) ||
        categoryMatch
      );
    });
    if (isSoilCompatible) return true;
  }

  // 3. Category based defaults (if no explicit compatibility is set, we might assume general compatibility for some)
  // For now, let's stick to explicit or semi-explicit matches to be safe.
  
  return false;
};

/**
 * Returns all compatible items for a given plant from the inventory.
 */
export const getCompatibleItems = (plant: Plant, inventory: InventoryItem[]): InventoryItem[] => {
  return inventory.filter(item => checkCompatibility(plant, item));
};

/**
 * Returns all compatible plants for a given inventory item.
 */
export const getCompatiblePlants = (item: InventoryItem, plants: Plant[]): Plant[] => {
  return plants.filter(plant => checkCompatibility(plant, item));
};
