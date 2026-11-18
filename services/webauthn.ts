import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { API_URL } from '../constants';
import { User } from '../types';

export interface WebAuthnStatus {
  hasUsers: boolean;
  hasCredentials: boolean;
  hasPasswords?: boolean;
  rpID: string;
  rpName: string;
}

export interface PasskeyCredentialInfo {
  id: string;
  label: string;
  deviceType: string;
  backedUp: number;
  createdAt: string;
  lastUsedAt: string;
}

export const isWebAuthnSupported = (): boolean => browserSupportsWebAuthn();

export async function getWebAuthnStatus(): Promise<WebAuthnStatus> {
  const res = await fetch(`${API_URL}/api/auth/webauthn/status`);
  if (!res.ok) throw new Error('AUTH_STATUS_FAULT');
  return res.json();
}

export interface PasswordLoginResult {
  verified?: boolean;
  token?: string;
  user?: User;
  totpRequired?: boolean;
  hasPasskeys?: boolean;
  message?: string;
  recoveryCodesRemaining?: number;
}

export async function loginWithPassword(params: {
  email: string;
  password: string;
  requireFido2?: boolean;
  totpCode?: string;
  recoveryCode?: string;
}): Promise<PasswordLoginResult> {
  const res = await fetch(`${API_URL}/api/auth/password/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: params.email.trim().toLowerCase(),
      password: params.password,
      requireFido2: Boolean(params.requireFido2),
      totpCode: params.totpCode?.trim() || undefined,
      recoveryCode: params.recoveryCode?.trim() || undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'PASSWORD_LOGIN_FAULT');
  }

  const data = await res.json();
  if (data.mfaRequired && data.options && data.challengeId) {
    const authResp = await startAuthentication({ optionsJSON: data.options });
    const verifyRes = await fetch(`${API_URL}/api/auth/webauthn/login/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: data.challengeId,
        response: authResp,
      }),
    });
    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new Error(err.error || 'WEBAUTHN_LOGIN_VERIFY_FAULT');
    }
    return verifyRes.json();
  }

  return data;
}

export async function setupTotp(token: string): Promise<{ secret: string; otpauthUri: string }> {
  const res = await fetch(`${API_URL}/api/auth/totp/setup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('TOTP_SETUP_FAULT');
  return res.json();
}

export async function verifyTotpSetup(
  token: string,
  code: string
): Promise<{ verified: boolean; totpEnabled: boolean; recoveryCodes: string[] }> {
  const res = await fetch(`${API_URL}/api/auth/totp/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'INVALID_TOTP_CODE');
  }
  return res.json();
}

export async function disableTotp(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/totp/disable`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('TOTP_DISABLE_FAULT');
}

export async function regenerateRecoveryCodes(token: string): Promise<{ recoveryCodes: string[] }> {
  const res = await fetch(`${API_URL}/api/auth/recovery/regenerate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('RECOVERY_FAULT');
  return res.json();
}

export interface UserComplianceItem {
  id: string;
  name: string;
  compliant: boolean;
}

export interface SecurityPolicyStatus {
  allUsersRequired: boolean;
  totalUsers: number;
  compliantUsers: number;
  nonCompliantUsers: number;
  userCompliance?: UserComplianceItem[];
}

export async function getSecurityPolicy(token?: string | null): Promise<SecurityPolicyStatus> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}/api/auth/policy`, { headers });
  if (!res.ok) throw new Error('POLICY_FAULT');
  return res.json();
}

export async function updateSecurityPolicy(token: string, allUsersRequired: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/policy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ allUsersRequired }),
  });
  if (!res.ok) throw new Error('POLICY_UPDATE_FAULT');
}

export async function revokeAllPasskeys(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/webauthn/credentials/revoke-all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('CREDENTIAL_REVOKE_FAULT');
}

export async function registerPasskey(params: {
  email: string;
  name?: string;
  label?: string;
  token?: string | null;
}): Promise<{ verified: boolean; token: string; user: User }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.token) {
    headers['Authorization'] = `Bearer ${params.token}`;
  }

  const optionsRes = await fetch(`${API_URL}/api/auth/webauthn/register/options`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: params.email.trim().toLowerCase(),
      name: params.name?.trim(),
    }),
  });

  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.error || 'WEBAUTHN_REGISTER_OPTIONS_FAULT');
  }

  const { options, challengeId } = await optionsRes.json();
  const attResp = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch(`${API_URL}/api/auth/webauthn/register/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      challengeId,
      response: attResp,
      label: params.label || navigator.platform || 'Passkey / Security Key',
    }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error || 'WEBAUTHN_REGISTER_VERIFY_FAULT');
  }

  return verifyRes.json();
}

export async function authenticateWithPasskey(
  email?: string
): Promise<{ verified: boolean; token: string; user: User }> {
  const optionsRes = await fetch(`${API_URL}/api/auth/webauthn/login/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { email: email.trim().toLowerCase() } : {}),
  });

  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.error || 'WEBAUTHN_LOGIN_OPTIONS_FAULT');
  }

  const { options, challengeId } = await optionsRes.json();
  const authResp = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch(`${API_URL}/api/auth/webauthn/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId,
      response: authResp,
    }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error || 'WEBAUTHN_LOGIN_VERIFY_FAULT');
  }

  return verifyRes.json();
}
