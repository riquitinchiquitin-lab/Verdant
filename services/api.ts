import { API_URL } from '../constants';
import { encryptPayload, decryptPayload } from './crypto';

/**
 * Enhanced fetch with Transport (TLS) and Payload (AES-GCM) encryption
 */
export const fetchWithAuth = async (endpoint: string, token: string, options: RequestInit = {}): Promise<any> => {
  // Check for the administrative master key to enable payload-level encryption
  let masterKey = localStorage.getItem('verdant_master_key');
  const storedUser = localStorage.getItem('verdant_user');
  let userRole = '';
  let userHouseId = '';
  let userId = '';
  if (storedUser) {
    try { 
      const u = JSON.parse(storedUser);
      userRole = u.role; 
      userHouseId = u.houseId;
      userId = u.id;
    } catch (e) {}
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Verdant-Version': '1.0.0',
    ...(userRole ? { 'x-user-role': userRole } : {}),
    ...(userHouseId ? { 'x-user-house-id': userHouseId } : {}),
    ...(userId ? { 'x-user-id': userId } : {}),
    ...(storedUser ? { 'x-user-email': JSON.parse(storedUser).email } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  let processedOptions = { ...options, headers: { ...headers } };

  if (import.meta.env.DEV) {
    console.log(`[API] ${options.method || 'GET'} ${endpoint}`);
  }

  // 1. Perform Outgoing Encryption if master key is available and there's a body
  if (masterKey && options.body && typeof options.body === 'string') {
    try {
      const originalData = JSON.parse(options.body);
      const encryptedData = await encryptPayload(originalData, masterKey!);
      
      processedOptions.body = JSON.stringify({ 
        vault: encryptedData,
        secure: true 
      });
      (processedOptions.headers as Record<string, string>)['X-Payload-Encryption'] = 'AES-256-GCM';
    } catch (e) {
      console.warn("Payload encryption skipped: Body not JSON or key invalid.");
    }
  }

  let response = await fetch(`${API_URL}${endpoint}`, processedOptions);

  if (response.status === 401) {
    console.warn("Unauthorized access");
    throw new Error("Unauthorized");
  }

  if (response.status === 400) {
      const cloned = response.clone();
      try {
          const errData = await cloned.json();
          if (errData.error === 'DECRYPTION_PROTOCOL_FAULT') {
              console.warn("[API] Decryption Protocol Fault detected. Attempting key re-sync...");
              const storedUser = localStorage.getItem('verdant_user');
              let userRole = '';
              if (storedUser) {
                  try { userRole = JSON.parse(storedUser).role; } catch (e) {}
              }
              if (userRole === 'OWNER' || userRole === 'CO_CEO') {
                  const configRes = await fetch(`${API_URL}/api/system/config`, {
                      headers: { 'Authorization': `Bearer ${token}`, 'x-user-role': userRole }
                  });
                  if (configRes.ok) {
                      const config = await configRes.json();
                      if (config.masterKey) {
                          console.info("[API] Master key re-synced from server.");
                          localStorage.setItem('verdant_master_key', config.masterKey);
                          // Recursive call to handle encryption/decryption on retry
                          return fetchWithAuth(endpoint, token, options);
                      }
                  }
              } else {
                  console.warn("[API] Non-admin user detected. Falling back to unencrypted retry.");
                  processedOptions.body = options.body;
                  delete (processedOptions.headers as Record<string, string>)['X-Payload-Encryption'];
                  return fetch(`${API_URL}${endpoint}`, processedOptions);
              }
          }
      } catch (e) {}
  }

  // 2. Handle Incoming Decryption
  if (masterKey && response.ok) {
    const isEncrypted = response.headers.get('X-Payload-Encryption') === 'AES-256-GCM';
    
    if (isEncrypted) {
      const data = await response.json();
      if (data.vault) {
        try {
            const decrypted = await decryptPayload(data.vault, masterKey!);
            
            // Create a proxy-like object that satisfies the Response interface enough for our needs
            return {
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              url: response.url,
              json: async () => decrypted,
              text: async () => JSON.stringify(decrypted),
              blob: async () => new Blob([JSON.stringify(decrypted)], { type: 'application/json' }),
              vault: data.vault, // Preserve the encrypted payload for backups
            } as any;
        } catch (e) {
            localStorage.removeItem('verdant_master_key');
            throw e;
        }
      }
    }
  }

  return response;
};