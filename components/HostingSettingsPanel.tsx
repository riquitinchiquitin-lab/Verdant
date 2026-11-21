import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Cloud,
  Shield,
  Home,
  Save,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Activity,
  Terminal,
  Sparkles,
  Server,
  Mail,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { fetchWithAuth } from '../services/api';
import { Button } from './ui/Button';

type HostingMode = 'cloudflare' | 'tailscale' | 'lan';

interface HostingConfig {
  workspaceName: string;
  hostingMode: HostingMode;
  appUrl: string;
  tailscaleDomain: string;
  cloudflareTokenConfigured: boolean;
  cloudflareTokenMasked: string;
  port: number;
  geminiReady: boolean;
}

export const HostingSettingsPanel: React.FC = () => {
  const { token } = useAuth();
  const { showNotification } = useSystem();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; latencyMs: number; error?: string } | null>(null);

  const [config, setConfig] = useState<HostingConfig>({
    workspaceName: 'Botanical Workspace',
    hostingMode: 'lan',
    appUrl: '',
    tailscaleDomain: '',
    cloudflareTokenConfigured: false,
    cloudflareTokenMasked: '',
    port: 3000,
    geminiReady: false,
  });
  const [tunnelTokenInput, setTunnelTokenInput] = useState('');

  const [smtpConfig, setSmtpConfig] = useState({
    configured: false,
    host: '',
    port: 587,
    user: '',
    pass: '',
    from: '',
    hasPass: false,
  });
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [res, smtpRes] = await Promise.all([
        fetchWithAuth('/api/system/hosting', token),
        fetchWithAuth('/api/system/smtp', token),
      ]);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data.cloudflareTokenMasked) {
          setTunnelTokenInput(data.cloudflareTokenMasked);
        }
      }
      if (smtpRes.ok) {
        const sData = await smtpRes.json();
        setSmtpConfig({
          configured: Boolean(sData.configured),
          host: sData.host || '',
          port: sData.port || 587,
          user: sData.user || '',
          pass: sData.hasPass ? '••••••••••••' : '',
          from: sData.from || '',
          hasPass: Boolean(sData.hasPass),
        });
      }
    } catch {
      // Ignore transient errors
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSaveSmtp = async () => {
    if (!token) return;
    setSavingSmtp(true);
    try {
      const res = await fetchWithAuth('/api/system/smtp', token, {
        method: 'POST',
        body: JSON.stringify(smtpConfig),
      });
      if (!res.ok) throw new Error('SMTP_SAVE_FAILED');
      const data = await res.json();
      setSmtpConfig((prev) => ({ ...prev, configured: Boolean(data.configured) }));
      showNotification('Nodemailer SMTP settings saved!', 'SUCCESS');
    } catch {
      showNotification('Failed to save SMTP settings', 'ERROR');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!token) return;
    setTestingSmtp(true);
    try {
      const res = await fetchWithAuth('/api/system/smtp/test', token, {
        method: 'POST',
        body: JSON.stringify(smtpConfig),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotification(data.error || 'SMTP connection failed', 'ERROR');
        return;
      }
      showNotification(`✓ SMTP verified! Test email sent to ${data.sentTo}`, 'SUCCESS');
    } catch (err: any) {
      showNotification(err?.message || 'SMTP test failed', 'ERROR');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSave = async (override?: Partial<HostingConfig>) => {
    if (!token) return;
    setSaving(true);
    try {
      const payload = {
        workspaceName: override?.workspaceName ?? config.workspaceName,
        hostingMode: override?.hostingMode ?? config.hostingMode,
        appUrl: override?.appUrl ?? config.appUrl,
        tailscaleDomain: override?.tailscaleDomain ?? config.tailscaleDomain,
        cloudflareTunnelToken: tunnelTokenInput,
      };
      const res = await fetchWithAuth('/api/system/hosting', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('SAVE_FAILED');
      const data = await res.json();
      if (typeof window !== 'undefined') {
        (window as any)._ENV_ = {
          ...((window as any)._ENV_ || {}),
          WORKSPACE_NAME: data.workspaceName,
        };
      }
      showNotification('HOSTING & WORKSPACE SETTINGS SAVED', 'SUCCESS');
      await loadConfig();
    } catch {
      showNotification('FAILED TO SAVE HOSTING SETTINGS', 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEndpoint = async () => {
    if (!token) return;
    const urlToTest = config.hostingMode === 'tailscale' ? config.tailscaleDomain : config.appUrl;
    if (!urlToTest.trim()) {
      showNotification('ENTER A PUBLIC URL FIRST', 'WARNING');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchWithAuth('/api/system/test-endpoint', token, {
        method: 'POST',
        body: JSON.stringify({ url: urlToTest }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        showNotification(`ENDPOINT REACHABLE (${data.latencyMs}ms)`, 'SUCCESS');
      } else {
        showNotification(`ENDPOINT CHECK: ${data.error || `HTTP ${data.status}`}`, 'WARNING');
      }
    } catch {
      showNotification('ENDPOINT TEST FAILED', 'ERROR');
    } finally {
      setTesting(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      showNotification('CLIPBOARD UNAVAILABLE', 'ERROR');
    }
  };

  const modeBadgeLabel =
    config.hostingMode === 'cloudflare'
      ? 'Cloudflare Zero Trust'
      : config.hostingMode === 'tailscale'
        ? 'Tailscale Funnel'
        : 'Local Homelab LAN';

  const dockerCommand = `docker run -d --name verdant_tunnel --restart unless-stopped cloudflare/cloudflared:latest tunnel --no-autoupdate run --token ${
    tunnelTokenInput && !tunnelTokenInput.includes('••••') ? tunnelTokenInput : '<CLOUDFLARE_TUNNEL_TOKEN>'
  }`;

  const systemdCommand = `systemctl enable --now verdant-tunnel.service`;
  const tailscaleCommand = `tailscale funnel --bg ${config.port}`;

  if (loading) {
    return (
      <div className="m3-card-elevated rounded-3xl p-8 border border-md-outline-variant/30 text-center text-sm text-md-on-surface-variant">
        Loading hosting configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Summary Card */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-7 border border-md-outline-variant/30 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-md-on-surface tracking-tight">
                  System, Hosting & Multi-Device Settings
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-md-primary-container text-md-on-primary-container">
                  Raspberry Pi, Linux & Proxmox
                </span>
              </div>
              <p className="text-xs text-md-on-surface-variant mt-1">
                Configure your access mode (Cloudflare Zero Trust, Tailscale Funnel, or LAN) and workspace identity.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-md-surface-container-high text-md-on-surface-variant">
              <Server className="w-3.5 h-3.5" />
              Port {config.port}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                config.geminiReady
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-md-surface-container-high text-md-on-surface-variant'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {config.geminiReady ? 'Gemini AI Ready' : 'Gemini Key Optional'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-md-secondary-container text-md-on-secondary-container">
              <Cloud className="w-3.5 h-3.5" />
              {modeBadgeLabel}
            </span>
            <Button variant="primary" size="sm" onClick={() => handleSave()} isLoading={saving}>
              <Save className="w-4 h-4" />
              Save Settings
            </Button>
          </div>
        </div>

        <div className="px-4 py-3 rounded-2xl bg-md-surface-container border border-md-outline-variant/30 text-xs text-md-on-surface-variant">
          Any saved modification updates server runtime memory, the SQLite settings store, and your on-disk <code className="font-mono text-md-primary">.env</code> file with zero downtime.
        </div>
      </div>

      {/* 0. Workspace Name Customization */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-7 border border-md-outline-variant/30 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-md-on-surface">
              0. Workspace Name Customization (WORKSPACE_NAME)
            </h4>
            <p className="text-xs text-md-on-surface-variant mt-0.5">
              Displayed in the navigation drawer and synced to your <code className="font-mono">.env</code> file.
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-md-tertiary-container text-md-on-tertiary-container">
            Customizable
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={config.workspaceName}
            onChange={(e) => setConfig((prev) => ({ ...prev, workspaceName: e.target.value }))}
            placeholder="Botanical Workspace"
            className="flex-1 h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
          />
          <Button
            variant="tonal"
            size="md"
            onClick={() => handleSave({ workspaceName: config.workspaceName })}
            isLoading={saving}
          >
            <Save className="w-4 h-4" />
            Save Name
          </Button>
        </div>
      </div>

      {/* 1. Hosting Mode & Domain */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-7 border border-md-outline-variant/30 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-md-on-surface">
              1. Hosting Mode & Domain
            </h4>
            <p className="text-xs text-md-on-surface-variant mt-0.5">
              Choose how to run and access Verdant remotely with HTTPS (required for WebAuthn passkeys & Web Bluetooth).
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-md-primary-container/60 text-md-on-primary-container self-start">
            {modeBadgeLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Cloudflare Tunnel */}
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, hostingMode: 'cloudflare' }))}
            className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
              config.hostingMode === 'cloudflare'
                ? 'bg-md-primary-container/25 border-md-primary ring-2 ring-md-primary/25'
                : 'bg-md-surface-container border-md-outline-variant/40 hover:border-md-outline'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Cloud className="w-4 h-4" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300">
                  Recommended
                </span>
              </div>
              <p className="text-sm font-bold text-md-on-surface">Cloudflare Tunnel (Zero Trust)</p>
              <p className="text-xs text-md-on-surface-variant leading-relaxed">
                Zero open ports, automatic HTTPS, DDoS protection. Works behind CGNAT, firewalls & cellular.
              </p>
            </div>
            <span className="text-xs font-semibold text-md-primary">
              {config.hostingMode === 'cloudflare' ? '● Selected Mode' : '○ Select Mode'}
            </span>
          </button>

          {/* Tailscale Funnel */}
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, hostingMode: 'tailscale' }))}
            className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
              config.hostingMode === 'tailscale'
                ? 'bg-md-primary-container/25 border-md-primary ring-2 ring-md-primary/25'
                : 'bg-md-surface-container border-md-outline-variant/40 hover:border-md-outline'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300">
                  Zero-Config HTTPS
                </span>
              </div>
              <p className="text-sm font-bold text-md-on-surface">Tailscale Funnel</p>
              <p className="text-xs text-md-on-surface-variant leading-relaxed">
                Public encrypted HTTPS via MagicDNS or private Tailnet access without router port forwarding.
              </p>
            </div>
            <span className="text-xs font-semibold text-md-primary">
              {config.hostingMode === 'tailscale' ? '● Selected Mode' : '○ Select Mode'}
            </span>
          </button>

          {/* Local Homelab LAN */}
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, hostingMode: 'lan' }))}
            className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
              config.hostingMode === 'lan'
                ? 'bg-md-primary-container/25 border-md-primary ring-2 ring-md-primary/25'
                : 'bg-md-surface-container border-md-outline-variant/40 hover:border-md-outline'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center">
                  <Home className="w-4 h-4" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-md-primary-container text-md-on-primary-container">
                  Private LAN
                </span>
              </div>
              <p className="text-sm font-bold text-md-on-surface">Local Homelab LAN</p>
              <p className="text-xs text-md-on-surface-variant leading-relaxed">
                Exclusive access over local Wi-Fi (192.168.x.x or mDNS http://verdant.local:{config.port}).
              </p>
            </div>
            <span className="text-xs font-semibold text-md-primary">
              {config.hostingMode === 'lan' ? '● Selected Mode' : '○ Select Mode'}
            </span>
          </button>
        </div>

        {/* Mode-specific configuration */}
        {config.hostingMode === 'cloudflare' && (
          <div className="p-4 md:p-5 rounded-2xl bg-md-surface-container border border-md-outline-variant/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-md-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-md-on-surface">
                  Cloudflare Zero Trust Tunnel Setup
                </span>
              </div>
              <a
                href="https://one.dash.cloudflare.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors self-start"
              >
                Open Cloudflare Dashboard
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-md-on-surface-variant">
                  Cloudflare Tunnel Token (CLOUDFLARE_TUNNEL_TOKEN)
                </label>
                {config.cloudflareTokenConfigured && (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    ✓ Configured
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tunnelTokenInput}
                  onChange={(e) => setTunnelTokenInput(e.target.value)}
                  placeholder="eyJhIjoi..."
                  className="flex-1 h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 font-mono text-xs text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="w-11 h-11 rounded-2xl bg-md-surface-container-high border border-md-outline-variant/50 flex items-center justify-center text-md-on-surface-variant hover:text-md-on-surface"
                  aria-label="Toggle token visibility"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-md-on-surface-variant">
                Generated in Cloudflare Zero Trust &gt; Networks &gt; Tunnels &gt; Add a tunnel. No router port forwarding required.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-md-on-surface-variant">
                Public Cloudflare URL (APP_URL)
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="url"
                  value={config.appUrl}
                  onChange={(e) => setConfig((prev) => ({ ...prev, appUrl: e.target.value }))}
                  placeholder="https://verdant.yourdomain.org"
                  className="flex-1 h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
                />
                <Button variant="tonal" size="md" onClick={handleTestEndpoint} isLoading={testing}>
                  <Activity className="w-4 h-4" />
                  Test Endpoint
                </Button>
                <Button variant="primary" size="md" onClick={() => handleSave()} isLoading={saving}>
                  <Save className="w-4 h-4" />
                  Save
                </Button>
              </div>
              {testResult && (
                <p
                  className={`text-xs font-semibold ${
                    testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-md-error'
                  }`}
                >
                  {testResult.ok
                    ? `✓ Endpoint healthy (HTTP ${testResult.status} in ${testResult.latencyMs}ms)`
                    : `✕ Unreachable (${testResult.error || `HTTP ${testResult.status}`})`}
                </p>
              )}
            </div>

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-md-on-surface flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-md-primary" />
                  Tunnel Runner Commands
                </span>
                <span className="text-[11px] text-md-on-surface-variant">Copy and run on your host</span>
              </div>

              <div className="rounded-2xl bg-slate-950 text-slate-100 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>1. Docker CLI (Run tunnel daemon)</span>
                  <button
                    type="button"
                    onClick={() => copyText('docker', dockerCommand)}
                    className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    {copiedKey === 'docker' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === 'docker' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all text-emerald-200">
                  {dockerCommand}
                </pre>
              </div>

              <div className="rounded-2xl bg-slate-950 text-slate-100 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>2. Proxmox / Debian Systemd Service</span>
                  <button
                    type="button"
                    onClick={() => copyText('systemd', systemdCommand)}
                    className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    {copiedKey === 'systemd' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === 'systemd' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="font-mono text-xs overflow-x-auto text-emerald-200">{systemdCommand}</pre>
              </div>
            </div>
          </div>
        )}

        {config.hostingMode === 'tailscale' && (
          <div className="p-4 md:p-5 rounded-2xl bg-md-surface-container border border-md-outline-variant/40 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-md-on-surface-variant">
                Tailscale MagicDNS / Funnel URL (TAILSCALE_DOMAIN)
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="url"
                  value={config.tailscaleDomain}
                  onChange={(e) => setConfig((prev) => ({ ...prev, tailscaleDomain: e.target.value }))}
                  placeholder="https://verdant.tailnet-name.ts.net"
                  className="flex-1 h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
                />
                <Button variant="tonal" size="md" onClick={handleTestEndpoint} isLoading={testing}>
                  <Activity className="w-4 h-4" />
                  Test Endpoint
                </Button>
                <Button variant="primary" size="md" onClick={() => handleSave()} isLoading={saving}>
                  <Save className="w-4 h-4" />
                  Save
                </Button>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-950 text-slate-100 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Enable Tailscale Funnel on host</span>
                <button
                  type="button"
                  onClick={() => copyText('tailscale', tailscaleCommand)}
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold"
                >
                  {copiedKey === 'tailscale' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'tailscale' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="font-mono text-xs text-emerald-200">{tailscaleCommand}</pre>
            </div>
          </div>
        )}

        {config.hostingMode === 'lan' && (
          <div className="p-4 md:p-5 rounded-2xl bg-md-surface-container border border-md-outline-variant/40 space-y-2">
            <p className="text-xs font-semibold text-md-on-surface">Local Homelab LAN Access</p>
            <p className="text-xs text-md-on-surface-variant">
              Verdant listens on port <code className="font-mono text-md-primary">{config.port}</code>. Note that WebAuthn passkeys and Web Bluetooth (Niimbot D110) require HTTPS or <code className="font-mono">localhost</code>; use Cloudflare Tunnel or Tailscale Funnel for mobile HTTPS access.
            </p>
          </div>
        )}
      </div>

      {/* NODEMAILER OPEN-SOURCE SMTP ADDON FOR ONE-TIME EMAILS */}
      <div className="m3-card-elevated rounded-3xl p-5 md:p-7 border border-md-outline-variant/40 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold text-md-on-surface">
                  Cloudflare / Resend SMTP Add-on (One-Time Self-Destructing Emails)
                </h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    smtpConfig.configured
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : 'bg-md-surface-container-high text-md-on-surface-variant'
                  }`}
                >
                  {smtpConfig.configured ? 'Configured' : 'Optional'}
                </span>
              </div>
              <p className="text-xs text-md-on-surface-variant">
                Used to automatically send self-destructing one-time password links when creating or editing user passwords.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="tonal" size="md" onClick={handleTestSmtp} isLoading={testingSmtp}>
              <Activity className="w-4 h-4" />
              Test Email
            </Button>
            <Button variant="primary" size="md" onClick={handleSaveSmtp} isLoading={savingSmtp}>
              <Save className="w-4 h-4" />
              Save SMTP
            </Button>
          </div>
        </div>

        {/* 1-CLICK CLOUDFLARE PRESETS */}
        <div className="p-3.5 rounded-2xl bg-md-surface-container border border-md-outline-variant/30 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-md-on-surface-variant">
            <strong className="text-md-on-surface">Cloudflare Domain Quick-Fill:</strong> Click a preset below, then paste your API Key.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setSmtpConfig((prev) => ({
                  ...prev,
                  host: 'smtp.resend.com',
                  port: 465,
                  user: 'resend',
                }))
              }
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-md-primary text-md-on-primary hover:opacity-90 transition-opacity"
            >
              ⚡ Apply Resend Preset (Recommended)
            </button>
            <button
              type="button"
              onClick={() =>
                setSmtpConfig((prev) => ({
                  ...prev,
                  host: 'smtp-relay.brevo.com',
                  port: 587,
                }))
              }
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-md-surface-container-high text-md-on-surface border border-md-outline-variant/40 hover:border-md-primary transition-colors"
            >
              Apply Brevo Preset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">
              SMTP Host
            </label>
            <input
              type="text"
              value={smtpConfig.host}
              onChange={(e) => setSmtpConfig((prev) => ({ ...prev, host: e.target.value }))}
              placeholder="smtp.resend.com"
              className="w-full h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-xs font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">
              SMTP Port
            </label>
            <input
              type="number"
              value={smtpConfig.port}
              onChange={(e) => setSmtpConfig((prev) => ({ ...prev, port: Number(e.target.value) || 465 }))}
              placeholder="465 (SSL) or 587 (STARTTLS)"
              className="w-full h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-xs font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">
              Sender "From" Address (Your Cloudflare Domain)
            </label>
            <input
              type="email"
              value={smtpConfig.from}
              onChange={(e) => setSmtpConfig((prev) => ({ ...prev, from: e.target.value }))}
              placeholder="security@yourdomain.com"
              className="w-full h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-xs font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">
              SMTP Username
            </label>
            <input
              type="text"
              value={smtpConfig.user}
              onChange={(e) => setSmtpConfig((prev) => ({ ...prev, user: e.target.value }))}
              placeholder="resend"
              className="w-full h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-xs font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1">
              Resend API Key / SMTP Password
            </label>
            <div className="relative">
              <input
                type={showSmtpPass ? 'text' : 'password'}
                value={smtpConfig.pass}
                onChange={(e) => setSmtpConfig((prev) => ({ ...prev, pass: e.target.value }))}
                placeholder="re_123456789..."
                className="w-full h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl pl-4 pr-10 text-xs font-mono text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
              />
              <button
                type="button"
                onClick={() => setShowSmtpPass(!showSmtpPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant hover:text-md-on-surface"
              >
                {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
