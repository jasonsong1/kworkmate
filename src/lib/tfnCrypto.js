// ==============================================================================
// KWorkMate 프론트엔드 보안 유틸리티: TFN 마스킹 및 포맷팅 모듈
// 호주 개인정보보호법(Privacy Act 1988) 및 국세청 규정 준수
// ==============================================================================

/**
 * TFN 번호 화면 표시용 마스킹 (예: 123456789 -> ••• ••• 789)
 * @param {string} tfn - TFN 번호
 * @param {boolean} showAll - 전체 공개 여부 (관리자 확인 시)
 * @returns {string} 포맷팅된 TFN 문자열
 */
export function formatTfnDisplay(tfn, showAll = false) {
  if (!tfn) return '—';
  if (tfn.startsWith('enc_')) return '••••••••• (보안 암호화 저장됨)';

  const digits = String(tfn).replace(/\D/g, '');
  if (!digits) return '—';

  if (digits.length !== 9 && digits.length !== 8) {
    return digits;
  }

  if (showAll) {
    if (digits.length === 9) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }

  // 기본 마스킹: 마지막 3자리만 노출
  if (digits.length === 9) {
    return `••• ••• ${digits.slice(6)}`;
  }
  return `•• ••• ${digits.slice(5)}`;
}

/**
 * 9자리 숫자 형식의 TFN 유효성 체크
 * @param {string} tfn
 * @returns {boolean}
 */
export function isValidTfn(tfn) {
  if (!tfn) return false;
  const digits = String(tfn).replace(/\D/g, '');
  return digits.length === 8 || digits.length === 9;
}
