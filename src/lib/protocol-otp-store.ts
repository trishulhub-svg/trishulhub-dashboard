// In-memory OTP store for protocol invites (similar to protocol-auth)
import { randomBytes } from "crypto";

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
