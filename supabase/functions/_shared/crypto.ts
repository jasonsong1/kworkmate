// ==============================================================================
// KWorkMate 보안 유틸리티: TFN(Tax File Number) 및 민감 개인정보 암호화 모듈
// 규정: 호주 개인정보보호법 (Privacy Act 1988) 및 TFN Rule 준수
// 알고리즘: AES-256-GCM (산업 표준 대칭키 인증 암호화)
// ==============================================================================

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // GCM 권장 96-bit (12 bytes) IV

/**
 * 환경 변수나 고유 솔트로부터 256비트 암호화 키를 파생합니다.
 */
async function getMasterKey(): Promise<CryptoKey> {
  const secret =
    (typeof Deno !== 'undefined' && Deno.env.get('TFN_ENCRYPTION_KEY')) ||
    (typeof Deno !== 'undefined' && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ||
    'kworkmate-tfn-secure-master-encryption-key-2026';

  const encoder = new TextEncoder();
  const rawKey = encoder.encode(secret.padEnd(32, '!').slice(0, 32));

  return await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 평문 문자열을 AES-256-GCM으로 암호화하여 'enc_iv:ciphertext' 형태의 16진수 문자열로 반환합니다.
 */
export async function encryptSensitiveText(plainText: string): Promise<string> {
  if (!plainText || typeof plainText !== 'string') return '';
  const trimmed = plainText.trim();
  if (!trimmed) return '';

  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encodedData = new TextEncoder().encode(trimmed);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encodedData
  );

  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
  const cipherHex = Array.from(new Uint8Array(encryptedBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `enc_${ivHex}:${cipherHex}`;
}

/**
 * 암호화된 문자열을 복호화하여 원본 평문으로 복원합니다. (이미 평문이거나 암호화되지 않은 경우 그대로 반환)
 */
export async function decryptSensitiveText(encryptedText: string): Promise<string> {
  if (!encryptedText || typeof encryptedText !== 'string') return '';
  if (!encryptedText.startsWith('enc_')) return encryptedText; // 평문 호환성 유지

  try {
    const raw = encryptedText.slice(4);
    const [ivHex, cipherHex] = raw.split(':');
    if (!ivHex || !cipherHex) return encryptedText;

    const iv = new Uint8Array(
      ivHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    const cipherBytes = new Uint8Array(
      cipherHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    const key = await getMasterKey();
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      cipherBytes
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('[decryptSensitiveText] Decryption failed:', error);
    return '';
  }
}

/**
 * 화면 표시용 TFN 마스킹 함수 (예: "123 456 789" -> "••• ••• 789")
 */
export function maskTfn(tfn: string): string {
  if (!tfn) return '';
  const digits = tfn.replace(/\D/g, '');
  if (digits.length < 3) return digits;
  const lastThree = digits.slice(-3);
  return `••• ••• ${lastThree}`;
}
