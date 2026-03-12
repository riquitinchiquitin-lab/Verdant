/**
 * Unit definitions and conversion factors
 */
export const UNIT_SYSTEMS = {
  METRIC: [
    { label: 'Milliliters (ml)', value: 'ml', type: 'volume', factor: 0.001 }, // Base is Liter
    { label: 'Liters (L)', value: 'L', type: 'volume', factor: 1 },
    { label: 'Milligrams (mg)', value: 'mg', type: 'mass', factor: 0.001 }, // Base is Gram
    { label: 'Grams (g)', value: 'g', type: 'mass', factor: 1 },
    { label: 'Kilograms (kg)', value: 'kg', type: 'mass', factor: 1000 },
  ],
  IMPERIAL: [
    { label: 'Fluid Ounces (fl oz)', value: 'fl oz', type: 'volume', factor: 0.0295735 },
    { label: 'Cups', value: 'cup', type: 'volume', factor: 0.236588 },
    { label: 'Pints (pt)', value: 'pt', type: 'volume', factor: 0.473176 },
    { label: 'Quarts (qt)', value: 'qt', type: 'volume', factor: 0.946353 },
    { label: 'Gallons (gal)', value: 'gal', type: 'volume', factor: 3.78541 },
    { label: 'Ounces (oz)', value: 'oz', type: 'mass', factor: 28.3495 },
    { label: 'Pounds (lb)', value: 'lb', type: 'mass', factor: 453.592 },
  ]
};

const ALL_UNITS = [...UNIT_SYSTEMS.METRIC, ...UNIT_SYSTEMS.IMPERIAL];

/**
 * Converts a value from one unit to another.
 * If units are incompatible (volume vs mass), it does a straight numerical pass-through.
 */
export const convertValue = (value: number, fromUnit: string, toUnit: string): number => {
  const from = ALL_UNITS.find(u => u.value.toLowerCase() === fromUnit.toLowerCase());
  const to = ALL_UNITS.find(u => u.value.toLowerCase() === toUnit.toLowerCase());

  if (!from || !to || from.type !== to.type) return value;

  // Convert to base, then to target
  const baseValue = value * from.factor;
  return baseValue / to.factor;
};

/**
 * Formats a volume/mass value and unit for better readability.
 * Converts small decimal units to their smaller counterparts (e.g., 0.5L -> 500ml).
 */
export const formatVolume = (value: number, unit: string): { value: string; unit: string } => {
  let finalValue = value;
  let finalUnit = unit;

  const lowerUnit = unit.toLowerCase().trim();

  // Metric Volume Conversions
  if ((lowerUnit === 'l' || lowerUnit === 'liters') && value < 1 && value > 0) {
    finalValue = value * 1000;
    finalUnit = 'ml';
  } 
  // Metric Mass Conversions
  else if ((lowerUnit === 'kg' || lowerUnit === 'kilograms') && value < 1 && value > 0) {
    finalValue = value * 1000;
    finalUnit = 'g';
  } else if ((lowerUnit === 'g' || lowerUnit === 'grams') && value < 1 && value > 0) {
    finalValue = value * 1000;
    finalUnit = 'mg';
  }
  
  // Imperial Conversions
  else if ((lowerUnit === 'gal' || lowerUnit === 'gallons') && value < 0.25 && value > 0) {
    finalValue = value * 128;
    finalUnit = 'fl oz';
  } else if ((lowerUnit === 'lb' || lowerUnit === 'pounds') && value < 1 && value > 0) {
    finalValue = value * 16;
    finalUnit = 'oz';
  }

  // Handle precision
  const displayValue = Number.isInteger(finalValue) 
    ? finalValue.toString() 
    : finalValue.toFixed(2).replace(/\.?0+$/, "");

  return { value: displayValue, unit: finalUnit };
};
