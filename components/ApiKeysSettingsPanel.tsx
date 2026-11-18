import React, { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, Trash2, CheckCircle2, ShieldCheck, Save, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { fetchWithAuth } from '../services/api';
import { Button } from './ui/Button';

interface ApiKeyStatus {
  key: string;
  configured: boolean;
  masked: string;
  source: 'vault' | 'env' | 'none';
  updatedAt: string | null;
}

const KEY_META: Record<string, { label: string; description: string; placeholder: string }> = {
  GEMINI_API_KEY: {
    label: 'Google Gemini API Key',
    description: 'Powers AI plant identification, care diagnostics, and botanical enrichment.',
    placeholder: 'AIzaSy...',
  },
  PERENUAL_API_KEY: {
    label: 'Perenual API Key',
    description: 'Species lookup, watering/sunlight specs, and pest profiles.',
    placeholder: 'sk-...',
  },
  TREFLE_TOKEN: {
    label: 'Trefle API Token',
    description: 'Botanical taxonomy, native distribution, and growth traits.',
    placeholder: 'trefle token...',
  },
  PLANTNET_API_KEY: {
    label: 'Pl@ntNet API Key',
    description: 'Photo-based botanical species identification.',
    placeholder: '2b10...',
  },
  OPB_CLIENT_ID: {
    label: 'OpenPlantbook Client ID',
    description: 'OAuth client ID for OpenPlantbook environmental bounds.',
    placeholder: 'client_id...',
  },
  OPB_CLIENT_SECRET: {
    label: 'OpenPlantbook Client Secret',
    description: 'OAuth client secret paired with your OpenPlantbook Client ID.',
    placeholder: 'client_secret...',
  },
  SERPER_API_KEY: {
    label: 'Serper API Key',
    description: 'Web & botanical reference image search fallback.',
    placeholder: 'serper key...',
  },
};

export const ApiKeysSettingsPanel: React.FC = () => {
  const { token } = useAuth();
  const { showNotification } = useSystem();
  const [keys, setKeys] = useState<ApiKeyStatus[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [cleared, setCleared] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadKeys = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/system/api-keys', token);
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      showNotification('Failed to load API key status.', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const updates: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(drafts)) {
      if (v.trim()) updates[k] = v.trim();
    }
    for (const [k, isCleared] of Object.entries(cleared)) {
      if (isCleared && !(k in updates)) updates[k] = null;
    }

    if (Object.keys(updates).length === 0) {
      showNotification('No API key changes to save.', 'INFO');
      return;
    }

    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/system/api-keys', token, {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        setDrafts({});
        setCleared({});
        setRevealed({});
        await loadKeys();
        showNotification('API keys encrypted & saved to vault.', 'SUCCESS');
      } else {
        showNotification('Failed to save API keys.', 'ERROR');
      }
    } catch {
      showNotification('Failed to save API keys.', 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  const hasPendingChanges =
    Object.values(drafts).some((v) => v.trim().length > 0) ||
    Object.values(cleared).some(Boolean);

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="bg-md-surface-container rounded-[24px] p-6 border border-md-outline-variant/25 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-md-on-surface tracking-tight">
                Encrypted API Key Vault
              </h2>
              <p className="text-xs text-md-on-surface-variant leading-relaxed">
                Keys are encrypted in transit (AES-256-GCM) and encrypted at rest in SQLite. Existing secrets are never sent back to the browser.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="tonal"
            size="sm"
            onClick={loadKeys}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {loading && keys.length === 0 ? (
          <div className="py-10 text-center text-xs text-md-on-surface-variant">
            Loading encrypted key status...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {keys.map((item) => {
              const meta = KEY_META[item.key] || {
                label: item.key,
                description: '',
                placeholder: 'Enter API key...',
              };
              const isCleared = Boolean(cleared[item.key]);
              const isRevealed = Boolean(revealed[item.key]);
              const draftVal = drafts[item.key] || '';

              return (
                <div
                  key={item.key}
                  className="p-4 rounded-2xl bg-md-surface-container-low border border-md-outline-variant/25 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-3.5 h-3.5 text-md-primary shrink-0" />
                        <p className="text-sm font-semibold text-md-on-surface truncate">
                          {meta.label}
                        </p>
                      </div>
                      <p className="text-[11px] text-md-on-surface-variant mt-0.5">
                        {meta.description}
                      </p>
                    </div>

                    {isCleared ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-md-error-container text-md-on-error-container shrink-0">
                        Will Clear
                      </span>
                    ) : item.configured ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-md-primary-container/70 text-md-on-primary-container shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        {item.source === 'vault' ? 'Vault' : '.env'}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-md-surface-container-highest text-md-on-surface-variant shrink-0">
                        Not Set
                      </span>
                    )}
                  </div>

                  {item.configured && !isCleared && (
                    <p className="text-[11px] font-mono text-md-on-surface-variant bg-md-surface-container px-3 py-1.5 rounded-xl border border-md-outline-variant/15 truncate">
                      Current: {item.masked}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={isRevealed ? 'text' : 'password'}
                        autoComplete="off"
                        spellCheck={false}
                        value={draftVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDrafts((prev) => ({ ...prev, [item.key]: val }));
                          if (val.trim()) {
                            setCleared((prev) => ({ ...prev, [item.key]: false }));
                          }
                        }}
                        placeholder={
                          item.configured
                            ? 'Enter new key to replace...'
                            : meta.placeholder
                        }
                        className="w-full h-10 pl-3 pr-9 rounded-xl bg-md-surface-container border border-md-outline-variant/40 text-xs font-mono text-md-on-surface placeholder:text-md-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-md-primary/40"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRevealed((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                        }
                        aria-label={isRevealed ? 'Hide key' : 'Show key'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-md-on-surface-variant hover:text-md-on-surface p-1"
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {item.configured && (
                      <button
                        type="button"
                        onClick={() => {
                          setCleared((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                          setDrafts((prev) => ({ ...prev, [item.key]: '' }));
                        }}
                        title={isCleared ? 'Undo clear' : 'Clear stored key'}
                        className={`h-10 px-3 rounded-xl border text-xs font-medium transition-colors ${
                          isCleared
                            ? 'bg-md-error-container text-md-on-error-container border-md-error/30'
                            : 'bg-md-surface-container text-md-on-surface-variant border-md-outline-variant/40 hover:text-md-error hover:border-md-error/40'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-md-outline-variant/20">
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={saving || !hasPendingChanges}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Encrypting & Saving...' : 'Save API Keys'}
          </Button>
        </div>
      </div>
    </form>
  );
};
