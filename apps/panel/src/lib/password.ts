import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface PasswordStrength {
  ok: boolean;
  score: number;
  problems: string[];
}

export function checkPasswordStrength(plain: string): PasswordStrength {
  const problems: string[] = [];
  if (plain.length < 8) problems.push("Must be at least 8 characters long.");
  if (!/[a-z]/.test(plain)) problems.push("Must contain a lowercase letter.");
  if (!/[A-Z]/.test(plain)) problems.push("Must contain an uppercase letter.");
  if (!/[0-9]/.test(plain)) problems.push("Must contain a number.");
  const score = [plain.length >= 8, plain.length >= 12, /[a-z]/.test(plain), /[A-Z]/.test(plain), /[0-9]/.test(plain), /[^A-Za-z0-9]/.test(plain)].filter(
    Boolean,
  ).length;
  return { ok: problems.length === 0, score, problems };
}
