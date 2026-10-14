// ============================================================
// sendEmailWebhook/index.ts (Supabase Edge Function)
// 목적: 외부 시스템(Zapier, Make, 고객사 서버 등) 및 프론트엔드에서
//       간편하게 웹훅(HTTP POST) 형태로 Resend 이메일을 발송하는 전용 엔드포인트
// ============================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { brandedEmail, sendEmailDetailed } from '../_shared/email.ts';

async function handler(req: Request) {
  // 1. HTTP 메서드 확인 (POST만 허용)
  if (req.method !== 'POST') {
    return Response.json(
      { error: 'POST 요청만 지원합니다.' },
      { status: 405 }
    );
  }

  try {
    const base44 = createBase44Like();
    const body = await req.json().catch(() => ({}));

    // 2. 필수 수신자 및 제목 검증
    const to = body.to || body.recipient || body.email;
    const subject = body.subject || body.title;

    if (!to) {
      return Response.json(
        { error: '수신자 이메일(to)이 필요합니다.' },
        { status: 400 }
      );
    }
    if (!subject) {
      return Response.json(
        { error: '이메일 제목(subject)이 필요합니다.' },
        { status: 400 }
      );
    }

    // 3. 메일 본문 HTML 생성
    let htmlContent = '';
    if (body.html) {
      // 직접 작성한 HTML이 있는 경우 그대로 사용
      htmlContent = body.html;
    } else {
      // 템플릿 파라미터를 기반으로 KWorkMate 표준 브랜디드 템플릿 렌더링
      const heading = body.heading || subject;
      const lines = Array.isArray(body.lines)
        ? body.lines
        : body.content
        ? [body.content]
        : body.message
        ? [body.message]
        : ['안녕하세요, K-Workmate에서 보낸 안내 메일입니다.'];

      htmlContent = brandedEmail({
        heading,
        lines,
        ctaText: body.ctaText || body.cta_text || '',
        ctaUrl: body.ctaUrl || body.cta_url || '',
        brandColor: body.brandColor || body.brand_color || '#2563eb',
        badge: body.badge || '',
        tip: body.tip || '',
        footer: body.footer || 'Sent by K-Workmate with Resend'
      });
    }

    // 4. 발송 실행
    const customFrom = body.from || '';
    const customApiKey = body.apiKey || body.api_key || '';

    const result = await sendEmailDetailed(base44, {
      to,
      subject,
      html: htmlContent,
      attachments: body.attachments || [],
      from: customFrom,
      apiKey: customApiKey
    });

    if (!result.ok) {
      return Response.json(
        {
          success: false,
          error: result.error || '이메일 발송에 실패했습니다. API 키 및 발신 도메인 설정을 확인해 주세요.'
        },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      message: '이메일이 성공적으로 발송되었습니다.',
      to,
      subject,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('sendEmailWebhook error:', error);
    return Response.json(
      {
        success: false,
        error: error?.message || '서버 내부 오류가 발생했습니다.'
      },
      { status: 500 }
    );
  }
}

Deno.serve(withCors(handler));
