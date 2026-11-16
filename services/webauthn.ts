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
    headers: { 'Content-Type': 'application/json' },
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
