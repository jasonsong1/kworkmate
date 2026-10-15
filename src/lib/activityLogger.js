// ============================================================
// activityLogger.js
// 목적: 시스템 내 주요 사용자 활동/감사 로그를 표준화하여 activity_log 테이블에 기록
//
// 모듈별 차등 로깅:
// - 간단한 로그: branches, jobs, applicants, interviews, roster (요약 위주)
// - 디테일한 로그: attendance, leave, employees, settings (변경 전후 데이터, 사유 등)
// ============================================================

import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabaseClient';

/**
 * 민감 정보(비밀번호, 토큰 등)가 로그에 남지 않도록 정제하는 도우미 함수
 */
function sanitizeDetails(data) {
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(sanitizeDetails);
  }

  const SENSITIVE_KEYS = ['password', 'password_hash', 'password_salt', 'pin', 'token', 'secret'];
  const sanitized = {};
  
  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[PROTECTED]';
    } else if (val && typeof val === 'object') {
      sanitized[key] = sanitizeDetails(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * 사용자 활동 로그를 기록하는 공통 함수
 * @param {Object} params
 * @param {string} params.module - 'attendance' | 'leave' | 'employees' | 'settings' | 'branches' | 'jobs' | 'applicants' | 'interviews' | 'roster'
 * @param {string} params.action - 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'clock_in' | 'clock_out' 등
 * @param {string} params.summary - 사람이 한눈에 읽을 수 있는 요약 설명
 * @param {Object} [params.details] - 디테일한 로그용 전후 비교/사유 객체 { before, after, diff, reason }
 * @param {string} [params.targetId] - 대상 데이터 식별자 ID
 * @param {string} [params.targetName] - 대상 명칭 (예: 직원 이름, 지점명, 공고명 등)
 * @param {string} [params.branchId] - 특정 지점 ID (없으면 null)
 * @param {string} [params.companyId] - 회사 ID (없으면 현재 세션에서 추론)
 * @param {Object} [params.actor] - 작업자 정보 { email, name, role, presetKey }
 */
export async function logActivity({
  module,
  action,
  summary,
  details = null,
  targetId = null,
  targetName = null,
  branchId = null,
  companyId = null,
  actor = null,
}) {
  try {
    // 1. 현재 사용자 정보 파악
    let actorEmail = actor?.email || '';
    let actorName = actor?.name || '';
    let actorRole = actor?.role || '';
    let presetKey = actor?.presetKey || '';
    let compId = companyId || '';

    if (!actorEmail || !compId) {
      try {
        const me = await base44.auth.me();
        if (me) {
          actorEmail = actorEmail || me.email || '';
          actorName = actorName || me.full_name || me.name || actorEmail;
          actorRole = actorRole || me.app_role || me.role || '';
          presetKey = presetKey || me.preset_key || '';
          compId = compId || me.company_id || '';
        }
      } catch (_) {}
    }

    if (!actorEmail) {
      actorEmail = 'system@kworkmate.com';
      actorName = actorName || 'System';
    }

    // 2. 민감 정보 정제
    const cleanedDetails = details ? sanitizeDetails(details) : null;

    const payload = {
      company_id: compId || 'kworkmate',
      branch_id: branchId || null,
      actor_email: actorEmail,
      actor_name: actorName,
      actor_role: actorRole,
      preset_key: presetKey,
      module: String(module || 'system'),
      action: String(action || 'update'),
      target_id: targetId ? String(targetId) : null,
      target_name: targetName ? String(targetName) : null,
      summary: String(summary || ''),
      details: cleanedDetails,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };

    // 3. DB 저장: base44.entities.ActivityLog 또는 supabase 직접 insert
    if (supabase) {
      const { error } = await supabase.from('activity_log').insert(payload);
      if (error) {
        console.warn('[ActivityLogger] Supabase direct insert warning:', error.message);
      }
    } else {
      await base44.entities.ActivityLog.create(payload);
    }
  } catch (err) {
    // 로깅 실패가 본래 비즈니스 로직(출퇴근, 휴가 신청 등)을 중단시키지 않도록 경고만 출력
    console.warn('[ActivityLogger] Failed to record activity log:', err);
  }
}
