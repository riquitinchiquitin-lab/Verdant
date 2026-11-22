import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Download,
  Upload,
  Eye,
  EyeOff,
  Copy,
  Check,
  HardDrive,
  RefreshCw,
  Trash2,
  RotateCcw,
  FileSpreadsheet,
  FileCode2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { fetchWithAuth } from '../services/api';
import { Button } from './ui/Button';

interface ServerBackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  encrypted: boolean;
}

interface BackupVaultManagerProps {
  onTriggerRestoreWithContent: (rawContent: string, filename: string, key: string) => void;
  onRotateKey: () => void;
  onExportKeyFile: () => void;
  hasMasterKey: boolean;
}

export const BackupVaultManager: React.FC<BackupVaultManagerProps> = ({
  onTriggerRestoreWithContent,
  onRotateKey,
  onExportKeyFile,
  hasMasterKey,
}) => {
  const { user, token } = useAuth();
  const { showNotification } = useSystem();

  const [serverBackups, setServerBackups] = useState<ServerBackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showVaultKey, setShowVaultKey] = useState(false);
  const [copiedVaultKey, setCopiedVaultKey] = useState(false);
  const [importKeyInput, setImportKeyInput] = useState('');
  const [showImportKey, setShowImportKey] = useState(false);
  const [savingImportedKey, setSavingImportedKey] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  const currentMasterKey = localStorage.getItem('verdant_master_key') || '';
  const isOwner = user?.role === 'OWNER';

  // Auto-hide revealed Master Vault Key after 60 seconds to prevent shoulder-surfing
  useEffect(() => {
    if (!showVaultKey) return;
    const timer = setTimeout(() => setShowVaultKey(false), 60_000);
    return () => clearTimeout(timer);
  }, [showVaultKey]);

  const copySensitiveToClipboard = async (secretText: string, onCopied: () => void) => {
    try {
      await navigator.clipboard.writeText(secretText);
      onCopied();
      // Auto-clear clipboard after 60 seconds if still focused/available
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
      }, 60_000);
    } catch {
      showNotification('Clipboard access denied by browser', 'ERROR');
    }
  };

  const loadServerBackups = useCallback(async () => {
    if (!token) return;
    setLoadingBackups(true);
    try {
      const res = await fetchWithAuth('/api/system/backups', token);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setServerBackups(data);
      }
    } catch {
      // ignore transient errors
    } finally {
      setLoadingBackups(false);
    }
  }, [token]);

  useEffect(() => {
    loadServerBackups();
  }, [loadServerBackups]);

  const handleCreateServerSnapshot = async () => {
    if (!token || creatingSnapshot) return;
    setCreatingSnapshot(true);
    try {
      const res = await fetchWithAuth('/api/system/backups/create', token, {
        method: 'POST',
      });
      if (res.ok) {
        showNotification('Encrypted server backup snapshot created!', 'SUCCESS');
        await loadServerBackups();
      } else {
        showNotification('Failed to create server snapshot', 'ERROR');
      }
    } catch {
      showNotification('Failed to create server snapshot', 'ERROR');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  const handleDownloadServerBackup = async (filename: string) => {
    if (!token) return;
    try {
      const res = await fetchWithAuth(`/api/system/backups/${encodeURIComponent(filename)}`, token);
      if (!res.ok) {
        showNotification('Could not download backup file', 'ERROR');
        return;
      }
      const data = await res.json();
      const blob = new Blob([data.content || ''], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification(`Downloaded ${filename}`, 'SUCCESS');
    } catch {
      showNotification('Backup download failed', 'ERROR');
    }
  };

  const handleRestoreFromServerBackup = async (filename: string) => {
    if (!token) return;
    const keyToUse = importKeyInput.trim() || currentMasterKey;
    if (!keyToUse) {
      showNotification('Please enter or load your 50-character Vault Security Key first.', 'ERROR');
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/system/backups/${encodeURIComponent(filename)}`, token);
      if (!res.ok) {
        showNotification('Could not read server backup file', 'ERROR');
        return;
      }
      const data = await res.json();
      if (data.content) {
        onTriggerRestoreWithContent(data.content, filename, keyToUse);
      }
    } catch {
      showNotification('Failed to initiate server backup restore', 'ERROR');
    }
  };

  const handleDeleteServerBackup = async (filename: string) => {
    if (!token || !isOwner) return;
    try {
      const res = await fetchWithAuth(`/api/system/backups/${encodeURIComponent(filename)}`, token, {
        method: 'DELETE',
      });
      if (res.ok) {
        setServerBackups((prev) => prev.filter((b) => b.filename !== filename));
        showNotification('Backup snapshot deleted', 'SUCCESS');
      } else {
        showNotification('Only OWNER can delete server snapshots', 'ERROR');
      }
    } catch {
      showNotification('Failed to delete snapshot', 'ERROR');
    }
  };

  const handleApplyCustomVaultKey = async () => {
    const cleanKey = importKeyInput.trim();
    if (cleanKey.length < 32 || cleanKey.length > 128 || !/^[A-Za-z0-9_\-!@#$%^&*()+=]+$/.test(cleanKey)) {
      showNotification('Vault Security Key must be 32–128 valid characters (no spaces or control characters).', 'ERROR');
      return;
    }
    if (!token) return;
    setSavingImportedKey(true);
    try {
      if (isOwner) {
        const res = await fetchWithAuth('/api/system/vault-key', token, {
          method: 'POST',
          body: JSON.stringify({ key: cleanKey }),
        });
        if (!res.ok) throw new Error('VAULT_SYNC_FAILED');
        localStorage.setItem('verdant_master_key', cleanKey);
        setImportKeyInput('');
        showNotification('Vault Security Key synchronized & re-encrypted!', 'SUCCESS');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        localStorage.setItem('verdant_master_key', cleanKey);
        showNotification('Vault Key loaded into browser session for backup decryption.', 'SUCCESS');
      }
    } catch {
      localStorage.setItem('verdant_master_key', cleanKey);
      showNotification('Vault Key loaded into browser session for backup decryption.', 'SUCCESS');
    } finally {
      setSavingImportedKey(false);
    }
  };

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://verdant.yknet.org';
  const adminEmail = user?.email || 'admin@verdant.local';

  // Universal Password Manager Template Builder (supports masked on-screen view & unmasked export)
  const buildVaultNoteTemplate = (revealSecret: boolean) => {
    const displayedKey = currentMasterKey
      ? revealSecret
        ? currentMasterKey
        : '•••••••••••••••••••••••••••••••••••••••••••••••••• [CLICK REVEAL OR COPY]'
      : '[NOT_GENERATED_YET]';
    return [
      `=== VERDANT BOTANICAL SYSTEMS — MASTER SECURITY VAULT ===`,
      `Portal URL          : ${appOrigin}`,
      `Admin Login Email   : ${adminEmail}`,
      `Master Vault Key    : ${displayedKey}`,
      `Encryption Cipher   : AES-256-GCM (128-bit Auth Tag, PBKDF2-SHA256 100k iter)`,
      `Password KDF        : Argon2id (64 MiB Memory, NIST SP 800-63B)`,
      `2FA / Passkey       : FIDO2 WebAuthn + RFC 6238 TOTP`,
      `Database Path       : /app/data/verdant.db (Docker) or /root/verdant/data/verdant.db`,
      `Backup Archive Path : /app/data/backups/*.enc`,
      `Generated Timestamp : ${new Date().toISOString()}`,
      `=========================================================`,
      `IMPORTANT: You MUST keep the 50-character Master Vault Key above to decrypt any .enc backup file during disaster recovery.`,
    ].join('\n');
  };

  // 1. Universal CSV Export (Proton Pass, Bitwarden, 1Password, KeePassXC, Dashlane, NordPass)
  const handleExportPasswordManagerCsv = () => {
    if (!currentMasterKey) {
      showNotification('Generate or load your Master Vault Key before exporting.', 'ERROR');
      return;
    }
    // Prevent CSV Formula Injection (=, +, -, @, Tab, CR)
    const sanitizeCsvCell = (val: string) => {
      const str = String(val ?? '');
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const fullPlainTemplate = buildVaultNoteTemplate(true);
    const headers = ['title', 'website', 'username', 'password', 'notes', 'totp', 'custom_field_vault_key'];
    const row = [
      'Verdant Botanical Systems — Admin & Master Vault Key',
      appOrigin,
      adminEmail,
      currentMasterKey,
      fullPlainTemplate,
      '',
      currentMasterKey,
    ];
    const csvContent = `${headers.join(',')}\n${row.map(sanitizeCsvCell).join(',')}\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verdant_password_manager_import_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Universal Password Manager CSV downloaded (Proton Pass / Bitwarden / 1Password)', 'SUCCESS');
  };

  // 2. Native Bitwarden / Proton Pass JSON Vault Export
  const handleExportBitwardenProtonJson = () => {
    if (!currentMasterKey) {
      showNotification('Generate or load your Master Vault Key before exporting.', 'ERROR');
      return;
    }
    const fullPlainTemplate = buildVaultNoteTemplate(true);
    const bitwardenExport = {
      encrypted: false,
      folders: [],
      items: [
        {
          id: 'verdant-master-vault-record',
          organizationId: null,
          folderId: null,
          type: 1,
          reprompt: 0,
          name: 'Verdant Botanical Systems — Master Security Vault',
          notes: fullPlainTemplate,
          favorite: true,
          fields: [
            {
              name: 'MASTER_VAULT_KEY_AES256GCM',
              value: currentMasterKey,
              type: 1, // Hidden custom field
            },
            {
              name: 'BACKUP_FILE_EXTENSION',
              value: '.enc (AES-256-GCM Encrypted Snapshot)',
              type: 0,
            },
            {
              name: 'SERVER_DIRECTORY',
              value: '/root/verdant/data/backups',
              type: 0,
            },
          ],
          login: {
            uris: [{ match: null, uri: appOrigin }],
            username: adminEmail,
            password: currentMasterKey,
            totp: null,
          },
          collectionIds: null,
        },
      ],
    };
    const blob = new Blob([JSON.stringify(bitwardenExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verdant_bitwarden_protonpass_vault_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Bitwarden / Proton Pass / 1Password JSON Vault downloaded!', 'SUCCESS');
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  return (
    <div className="md:col-span-2 space-y-8">
      {/* 1. VAULT SECURITY KEY & SERVER BACKUP ARCHIVES */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black uppercase tracking-tight">
                  Vault Security Key &amp; Encrypted Backup Manager
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    hasMasterKey
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-600'
                  }`}
                >
                  {hasMasterKey ? 'AES-256-GCM Active' : 'Not Configured'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Required to encrypt and decrypt your <code className="font-mono">.enc</code> backup files. View, copy, paste, or rotate your 50-character Vault Security Key directly here.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onExportKeyFile} disabled={!hasMasterKey}>
              <Download className="w-3.5 h-3.5" />
              <span>Download Key (.txt)</span>
            </Button>
            {isOwner && (
              <Button variant="outlined" size="sm" onClick={onRotateKey}>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{hasMasterKey ? 'Rotate Key' : 'Generate Key'}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Active Master Key Display + Paste / Load Custom Key for Restore */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Active 50-Character Master Vault Key
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowVaultKey(!showVaultKey)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                >
                  {showVaultKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showVaultKey ? 'Hide (Auto 60s)' : 'Reveal'}</span>
                </button>
                {currentMasterKey && (
                  <button
                    type="button"
                    onClick={() => {
                      copySensitiveToClipboard(currentMasterKey, () => {
                        setCopiedVaultKey(true);
                        setTimeout(() => setCopiedVaultKey(false), 2500);
                      });
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400"
                  >
                    {copiedVaultKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedVaultKey ? 'Copied (Clears in 60s)!' : 'Copy Key'}</span>
                  </button>
                )}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold break-all select-all">
              {currentMasterKey
                ? showVaultKey
                  ? currentMasterKey
                  : '••••••••••••••••••••••••••••••••••••••••••••••••••'
                : 'No Master Vault Key generated yet.'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Load / Override Vault Security Key (For Restoring Backups)
            </span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showImportKey ? 'text' : 'password'}
                  value={importKeyInput}
                  onChange={(e) => setImportKeyInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste 50-char Vault Key from Proton Pass / Bitwarden / 1Password..."
                  className="w-full h-11 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-3.5 pr-9 text-xs font-mono font-bold outline-none focus:ring-2 ring-emerald-500/30"
                />
                <button
                  type="button"
                  onClick={() => setShowImportKey(!showImportKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showImportKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <Button
                variant="tonal"
                size="sm"
                onClick={handleApplyCustomVaultKey}
                isLoading={savingImportedKey}
                disabled={importKeyInput.trim().length < 32}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Apply Key</span>
              </Button>
            </div>
            <p className="text-[10px] text-slate-400">
              If you paste a key here, it will be used automatically when you click <strong>Restore</strong> on any backup below or upload a <code className="font-mono">.enc</code> file.
            </p>
          </div>
        </div>

        {/* On-Server Encrypted Backup Snapshots Table */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-500" />
              <h4 className="text-sm font-black uppercase tracking-wider">
                On-Server Encrypted Backup Files (<code className="font-mono text-xs">/data/backups/*.enc</code>)
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={loadServerBackups} isLoading={loadingBackups}>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh List</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateServerSnapshot}
                isLoading={creatingSnapshot}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>+ Create Server Snapshot Now</span>
              </Button>
            </div>
          </div>

          {serverBackups.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-2">
              <p className="text-xs font-bold text-slate-500">
                No on-server backup files stored yet.
              </p>
              <p className="text-[11px] text-slate-400">
                Click <strong>+ Create Server Snapshot Now</strong> or <strong>Download Backup</strong> above to save an AES-256-GCM encrypted snapshot directly on the server.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/70 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {serverBackups.map((b) => (
                <div
                  key={b.filename}
                  className="p-3.5 sm:px-5 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                        {b.filename}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        {b.encrypted ? 'AES-256-GCM .ENC' : 'JSON'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Created: {new Date(b.createdAt).toLocaleString()} · Size: {formatBytes(b.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outlined"
                      size="sm"
                      onClick={() => handleDownloadServerBackup(b.filename)}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </Button>
                    {isOwner && (
                      <Button
                        variant="tonal"
                        size="sm"
                        onClick={() => handleRestoreFromServerBackup(b.filename)}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore</span>
                      </Button>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleDeleteServerBackup(b.filename)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="Delete snapshot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. PASSWORD MANAGER VAULT TEMPLATE (PROTON PASS, BITWARDEN, 1PASSWORD, KEEPASSXC) */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">
                Password Manager Vault Export &amp; Template
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                1-click importable templates for <strong>Proton Pass</strong>, <strong>Bitwarden</strong>, <strong>1Password</strong>, <strong>KeePassXC</strong>, and <strong>Apple Passwords</strong> containing your Master Vault Key and recovery specs.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={handleExportPasswordManagerCsv}>
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Universal .CSV (Proton / 1Password / Bitwarden)</span>
            </Button>
            <Button variant="tonal" size="sm" onClick={handleExportBitwardenProtonJson}>
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Export Bitwarden / Proton .JSON</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 p-4 rounded-2xl bg-slate-950 text-slate-100 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                Standardized Security Note Template (Copy &amp; Paste into Any Vault)
              </span>
              <button
                type="button"
                onClick={() => {
                  copySensitiveToClipboard(buildVaultNoteTemplate(true), () => {
                    setCopiedTemplate(true);
                    setTimeout(() => setCopiedTemplate(false), 2500);
                  });
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:underline"
              >
                {copiedTemplate ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTemplate ? 'Copied (Clears in 60s)!' : 'Copy Full Template'}</span>
              </button>
            </div>
            <pre className="font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto whitespace-pre-wrap select-all">
              {buildVaultNoteTemplate(showVaultKey)}
            </pre>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
            <h4 className="font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              How to Import in Your Password Manager
            </h4>
            <ul className="space-y-2 text-slate-600 dark:text-slate-300 leading-relaxed">
              <li>
                <strong className="text-indigo-600 dark:text-indigo-400">Proton Pass:</strong> Open Proton Pass → <em>Settings → Import → Generic CSV</em> (or <em>Bitwarden JSON</em>) and select the file downloaded above.
              </li>
              <li>
                <strong className="text-sky-600 dark:text-sky-400">Bitwarden / Vaultwarden:</strong> Go to <em>Tools → Import Data → Format: Bitwarden (json)</em> and upload the <code className="font-mono">.json</code> file.
              </li>
              <li>
                <strong className="text-amber-600 dark:text-amber-400">1Password / KeePassXC:</strong> Go to <em>File → Import → CSV</em> and map <code className="font-mono">custom_field_vault_key</code> or <code className="font-mono">notes</code>.
              </li>
              <li>
                <strong className="text-emerald-600 dark:text-emerald-400">Attach Your .enc File:</strong> Most password managers allow attaching a file to a vault item — attach your latest <code className="font-mono">verdant_backup_*.enc</code> directly to that entry!
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
