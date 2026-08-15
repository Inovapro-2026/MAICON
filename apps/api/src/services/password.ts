import * as bcrypt from 'bcryptjs';

const ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Valida força mínima da senha. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'A senha deve ter pelo menos uma letra maiúscula';
  if (!/[0-9]/.test(password)) return 'A senha deve ter pelo menos um número';
  if (!/[^A-Za-z0-9]/.test(password)) return 'A senha deve ter pelo menos um caractere especial';
  return null;
}
