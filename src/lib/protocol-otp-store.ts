// In-memory OTP stores for protocol invites
import { randomBytes } from "crypto";

// ━━ Legacy OTP Store (kept for backward compatibility) ━━
export interface ProtocolOtpEntry {
  otp: string;
  expiresAt: number;
  inviteId: string;
  inviteCode: string;
  targetEmail: string;
  targetName: string | null;
  agentAccess: string[];
  protocolVersion: string;
}

const protocolOtpStore = new Map<string, ProtocolOtpEntry>();

export function storeProtocolOtp(inviteCode: string, entry: ProtocolOtpEntry) {
  protocolOtpStore.set(inviteCode, entry);
}

export function getProtocolOtp(inviteCode: string): ProtocolOtpEntry | undefined {
  return protocolOtpStore.get(inviteCode);
}

export function consumeProtocolOtp(inviteCode: string): ProtocolOtpEntry | undefined {
  const entry = protocolOtpStore.get(inviteCode);
  if (entry) protocolOtpStore.delete(inviteCode);
  return entry;
}

// ━━ Admin OTP Store (new flow: OTP sent to SUPER_ADMIN email) ━━
interface AdminOtpEntry {
  otp: string;
  expiresAt: number;
}

const adminOtpStore = new Map<string, AdminOtpEntry>();

export function storeAdminOtp(inviteCode: string, otp: string, expiresAt: number): void {
  adminOtpStore.set(inviteCode, { otp, expiresAt });
}

export function getAdminOtp(inviteCode: string): { otp: string; expiresAt: number } | undefined {
  return adminOtpStore.get(inviteCode);
}

export function consumeAdminOtp(inviteCode: string): { otp: string; expiresAt: number } | undefined {
  const entry = adminOtpStore.get(inviteCode);
  if (entry) adminOtpStore.delete(inviteCode);
  return entry;
}

// ━━ Utility Functions ━━

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TRISHUL-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generateOtp(): string {
  const num = randomBytes(3).readUIntBE(0, 3) % 1000000;
  return String(num).padStart(6, '0');
}
