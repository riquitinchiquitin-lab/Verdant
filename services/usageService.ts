import { API_URL } from '../constants';

export type ApiType = 'google_maps' | 'gemini' | 'plantnet' | 'trefle' | 'perenual' | 'serper';

export const trackUsage = async (type: ApiType) => {
  const token = localStorage.getItem('verdant_token');
  const userStr = localStorage.getItem('verdant_user');
  
  if (!token || !userStr) return;
  
  try {
    const user = JSON.parse(userStr);
    await fetch(`${API_URL}/api/system/track-usage`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-user-role': user.role,
        'x-user-id': user.id,
        'x-user-house-id': user.houseId || ''
      },
      body: JSON.stringify({ type })
    });
  } catch (e) {
    console.error(`[USAGE] Failed to track ${type}:`, e);
  }
};
