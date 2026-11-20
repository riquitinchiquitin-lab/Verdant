
/**
 * BOTANICAL DATA UPLINK
 * Redirected to internal backend proxy to prevent token exposure.
 */
import { API_URL } from '../constants';
import { trackUsage } from './usageService';

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('verdant_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

/**
 * Fetches botanical metadata via Internal Proxy (Trefle)
 */
export const fetchTrefleData = async (scientificName: string) => {
  try {
    const response = await fetch(`${API_URL}/api/proxy/trefle?q=${encodeURIComponent(scientificName)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    trackUsage('trefle');
    const json = await response.json();
    const match = json.data?.[0];
    if (!match) return null;

    if (match.id) {
      const detailRes = await fetch(`${API_URL}/api/proxy/trefle?id=${encodeURIComponent(String(match.id))}`, {
        headers: getAuthHeaders()
      });
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        if (detailJson?.data) return detailJson.data;
      }
    }
    return match;
  } catch (e) {
    return null;
  }
};

/**
 * Fetches technical care thresholds via Internal Proxy (OPB)
 */
export const fetchOpenPlantBookData = async (scientificName: string) => {
  try {
    // 1. Get OAuth Token from secure backend
    const tokenResponse = await fetch(`${API_URL}/api/proxy/opb/token`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!tokenResponse.ok) return null;
    const { access_token } = await tokenResponse.json();

    if (!access_token) return null;

    // 2. Search for Plant ID (PID)
    const searchUrl = `https://openplantbook.io/api/v1/plants/search?alias=${encodeURIComponent(scientificName)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
    });
    
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const pid = searchData.results?.[0]?.pid;

    if (!pid) return null;

    // 3. Get Full Specs
    const detailUrl = `https://openplantbook.io/api/v1/plants/${pid}/`;
    const detailRes = await fetch(detailUrl, {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
    });
    if (!detailRes.ok) return null;
    return await detailRes.json();
  } catch (e) {
    return null;
  }
};

/**
 * Fetches data from Perenual service via local proxy
 */
export const fetchPerenualData = async (query: string, page: number = 1) => {
  try {
    const response = await fetch(`${API_URL}/api/proxy/perenual?q=${encodeURIComponent(query)}&page=${page}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    trackUsage('perenual');
    const json = await response.json();
    const match = json?.data?.[0];
    if (match?.id) {
      const detailRes = await fetch(`${API_URL}/api/proxy/perenual?id=${encodeURIComponent(String(match.id))}`, {
        headers: getAuthHeaders()
      });
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        if (detailJson?.id) return detailJson;
      }
    }
    return json;
  } catch (e) {
    return null;
  }
};

/**
 * Performs a grounded search via Serper proxy
 */
export const searchGroundingData = async (query: string) => {
  try {
    const response = await fetch(`${API_URL}/api/proxy/serper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ q: query })
    });
    if (!response.ok) return null;
    trackUsage('serper');
    return await response.json();
  } catch (e) {
    return null;
  }
};

export const fetchGbifData = async (scientificName: string, gbifId?: string | number | null) => {
  try {
    const param = gbifId ? `id=${encodeURIComponent(String(gbifId))}` : `q=${encodeURIComponent(scientificName)}`;
    const response = await fetch(`${API_URL}/api/proxy/gbif?${param}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchPowoData = async (scientificName: string, powoId?: string | null) => {
  try {
    const param = powoId ? `id=${encodeURIComponent(powoId)}` : `q=${encodeURIComponent(scientificName)}`;
    const response = await fetch(`${API_URL}/api/proxy/powo?${param}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchINaturalistData = async (scientificName: string) => {
  try {
    const response = await fetch(`${API_URL}/api/proxy/inaturalist?q=${encodeURIComponent(scientificName)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export interface LocationZoneResult {
  displayName: string;
  latitude: number;
  longitude: number;
  minWinterTempC: number;
  hardinessZone: string;
  hardinessZoneNum: number;
}

export const lookupLocationZone = async (address: string): Promise<LocationZoneResult | null> => {
  try {
    const response = await fetch(`${API_URL}/api/proxy/geocode?q=${encodeURIComponent(address)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchNcsuData = async (scientificName: string) => {
  try {
    const response = await fetch(`${API_URL}/api/proxy/ncsu?q=${encodeURIComponent(scientificName)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchVascanData = async (scientificName: string) => {
  try {
    const response = await fetch(`${API_URL}/api/proxy/vascan?q=${encodeURIComponent(scientificName)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchAggregatedSpeciesData = async (query: string) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(`${API_URL}/api/aggregator/species?q=${encodeURIComponent(query)}`, {
      headers: getAuthHeaders(),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

