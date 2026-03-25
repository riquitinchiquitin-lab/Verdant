
/**
 * BOTANICAL DATA UPLINK
 * Redirected to internal backend proxy to prevent token exposure.
 */
import { API_URL } from '../constants';
import { trackUsage } from './usageService';

/**
 * Fetches botanical metadata via Internal Proxy (Trefle)
 */
export const fetchTrefleData = async (scientificName: string) => {
  try {
    trackUsage('trefle');
    const response = await fetch(`${API_URL}/api/proxy/trefle?q=${encodeURIComponent(scientificName)}`);
    if (!response.ok) return null;
    const json = await response.json();
    return json.data?.[0] || null;
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
    const tokenResponse = await fetch(`${API_URL}/api/proxy/opb/token`, { method: 'POST' });
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
    trackUsage('perenual');
    const response = await fetch(`${API_URL}/api/proxy/perenual?q=${encodeURIComponent(query)}&page=${page}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
};

/**
 * Performs a grounded search via Serper proxy
 */
export const searchGroundingData = async (query: string) => {
  try {
    trackUsage('serper');
    const response = await fetch(`${API_URL}/api/proxy/serper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    return null;
  }
};
