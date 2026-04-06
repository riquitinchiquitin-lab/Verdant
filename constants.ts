
// VERDANT UPLINK CONFIGURATION
// Relative path allows the Nginx proxy to handle routing internally via Docker
export const API_URL = ''; 

// Authentication - User must provide this via .env on Proxmox host
export const getGoogleClientId = (): string => {
  const id = (window as any)._ENV_?.GOOGLE_CLIENT_ID;
  if (id === undefined) return 'MISSING_CLIENT_ID';
  return id;
};

// Gemini API Key - Also injected at runtime
export const getGeminiApiKey = (): string => {
  let envKey = '';
  try {
    if (typeof process !== 'undefined' && process.env) {
      envKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    }
  } catch (e) {}
  
  const windowKey = (window as any)._ENV_?.API_KEY;
  const key = envKey || windowKey || '';
  if (!key || key === 'undefined' || key === 'null') return '';
  return key;
};

// Current App Version
export const APP_VERSION = '1.0';

// API Configuration - SECRETS REMOVED (Now handled by Backend Proxy)
export const OPB_CLIENT_ID = 'verdant_app';

export const COLORS = {
  primary: '#5E8F47', 
  secondary: '#3B82F6', 
  background: '#F9FAFB',
  surface: '#FFFFFF',
};

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'zh', label: '普通话 (Mandarin)', flag: '🇨🇳' },
  { code: 'ja', label: '日本語 (Japanese)', flag: '🇯🇵' },
  { code: 'ko', label: '한국어 (Korean)', flag: '🇰🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'id', label: 'Indonesian', flag: '🇮🇩' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'tl', label: 'Tagalog', flag: '🇵🇭' },
];

export const CURRENCIES = [
  { code: 'USD', label: 'USD - US Dollar', symbol: '$' },
  { code: 'GBP', label: 'GBP - British Pound', symbol: '£' },
  { code: 'EUR', label: 'EUR - Euro', symbol: '€' },
  { code: 'CNY', label: 'CNY - Chinese Yuan', symbol: '¥' },
  { code: 'JPY', label: 'JPY - Japanese Yen', symbol: '¥' },
  { code: 'KRW', label: 'KRW - South Korean Won', symbol: '₩' },
  { code: 'BRL', label: 'BRL - Brazilian Real', symbol: 'R$' },
  { code: 'IDR', label: 'IDR - Indonesian Rupiah', symbol: 'Rp' },
  { code: 'VND', label: 'VND - Vietnamese Dong', symbol: '₫' },
  { code: 'PHP', label: 'PHP - Philippine Peso', symbol: '₱' },
  { code: 'THB', label: 'THB - Thai Baht', symbol: '฿' },
  { code: 'CAD', label: 'CAD - Canadian Dollar', symbol: '$' },
];

export const getCurrencyForLanguage = (lang: string): string => {
  switch (lang) {
    case 'en': return 'GBP';
    case 'zh': return 'CNY';
    case 'ja': return 'JPY';
    case 'ko': return 'KRW';
    case 'es':
    case 'fr':
    case 'de': return 'EUR';
    case 'pt': return 'BRL';
    case 'id': return 'IDR';
    case 'vi': return 'VND';
    case 'tl': return 'PHP';
    case 'th': return 'THB';
    default: return 'USD';
  }
};

export const ROOM_TYPES = [
  "Living Room/Lounge/Family Room",
  "Kitchen",
  "Dining Room",
  "Bedroom",
  "Bathroom",
  "Nursery",
  "Guest Room",
  "Laundry Room/Utility Room",
  "Pantry",
  "Mudroom",
  "Attic/Loft",
  "Basement/Cellar",
  "Garage",
  "Closets",
  "Home Office/Study",
  "Game Room/Recreation Room",
  "Home Theater/Cinema Room",
  "Gym",
  "Library",
  "Sunroom/Conservatory",
  "Wine Cellar",
  "Hallway",
  "Corridor",
  "Stairs",
  "Lobby",
  "Porch"
];