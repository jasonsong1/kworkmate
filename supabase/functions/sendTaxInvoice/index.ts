import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { sendEmailDetailed } from '../_shared/email.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

/**
 * KWorkMate Tax Invoice 이메일 HTML 템플릿
 */
function buildInvoiceEmailHtml({
  companyName,
  invoiceNumber,
  issueDate,
  dueDate,
  planName,
  subtotal,
  gst,
  total,
  notes
}: {
  companyName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  planName: string;
  subtotal: number;
  gst: number;
  total: number;
  notes?: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Tax Invoice - ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:24px 0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05),0 2px 4px -2px rgba(0,0,0,0.05);border:1px solid #e2e8f0;">
          <!-- Top Accent Bar -->
          <tr>
            <td style="background-color:#4338ca;height:6px;line-height:6px;font-size:0;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding:32px 36px 20px 36px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="top">
                    <div style="font-size:24px;font-weight:800;color:#4338ca;letter-spacing:-0.5px;">KWorkMate</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px;">Workforce Management Platform</div>
                  </td>
                  <td valign="top" align="right">
                    <div style="display:inline-block;background-color:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:700;padding:6px 12px;border-radius:9999px;border:1px solid #bfdbfe;">
                      TAX INVOICE
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Invoice Details Card -->
          <tr>
            <td style="padding:0 36px 24px 36px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border-radius:10px;padding:16px 20px;border:1px solid #e2e8f0;">
                <tr>
                  <td width="50%" valign="top">
                    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;">Invoice Number</div>
                    <div style="font-size:15px;font-weight:700;color:#0f172a;margin-top:2px;">${invoiceNumber}</div>
                    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin-top:12px;">Issue Date</div>
                    <div style="font-size:13px;color:#334155;margin-top:2px;">${issueDate}</div>
                  </td>
                  <td width="50%" valign="top" align="right">
                    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;">Amount Due</div>
                    <div style="font-size:20px;font-weight:800;color:#4338ca;margin-top:2px;">$${total.toFixed(2)} AUD</div>
                    <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;margin-top:8px;">Due Date</div>
                    <div style="font-size:13px;font-weight:600;color:#dc2626;margin-top:2px;">${dueDate}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bill To Greeting -->
          <tr>
            <td style="padding:0 36px 20px 36px;">
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#334155;">
                Hello <strong>${companyName}</strong>,
              </p>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
                Thank you for using KWorkMate! Please find the tax invoice details for your monthly software subscription below.
              </p>
            </td>
          </tr>

          <!-- Breakdown Table -->
          <tr>
            <td style="padding:0 36px 24px 36px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="border-bottom:2px solid #e2e8f0;text-align:left;">
                    <th style="padding:8px 0;color:#64748b;font-weight:600;">Description</th>
                    <th style="padding:8px 0;color:#64748b;font-weight:600;text-align:right;">Amount (AUD)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:14px 0;color:#1e293b;">
                      <strong>KWorkMate Subscription - ${planName} Plan</strong>
                      <div style="font-size:12px;color:#64748b;margin-top:2px;">Monthly workforce management service</div>
                    </td>
                    <td style="padding:14px 0;color:#1e293b;text-align:right;font-weight:600;">$${subtotal.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#64748b;">Subtotal (excl. GST)</td>
                    <td style="padding:8px 0;color:#1e293b;text-align:right;">$${subtotal.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0 10px 0;color:#64748b;">GST (10%)</td>
                    <td style="padding:4px 0 10px 0;color:#1e293b;text-align:right;">$${gst.toFixed(2)}</td>
                  </tr>
                  <tr style="border-top:2px solid #e2e8f0;">
                    <td style="padding:12px 0;font-size:15px;font-weight:700;color:#0f172a;">Total Amount (incl. GST)</td>
                    <td style="padding:12px 0;font-size:16px;font-weight:800;color:#4338ca;text-align:right;">$${total.toFixed(2)} AUD</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Payment Instructions (EFT Bank Details) -->
          <tr>
            <td style="padding:0 36px 28px 36px;">
              <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:18px 20px;">
                <div style="font-size:14px;font-weight:700;color:#1e40af;margin-bottom:10px;">Payment Details (Direct Deposit / EFT)</div>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;color:#1e3a8a;">
                  <tr>
                    <td width="35%" style="padding:3px 0;color:#475569;">Bank:</td>
                    <td style="padding:3px 0;font-weight:600;">Commonwealth Bank of Australia (CBA)</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 0;color:#475569;">BSB:</td>
                    <td style="padding:3px 0;font-weight:700;color:#1e40af;">062-006</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 0;color:#475569;">Account Number:</td>
                    <td style="padding:3px 0;font-weight:700;color:#1e40af;">1128 9380</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 0;color:#475569;">Account Name:</td>
                    <td style="padding:3px 0;font-weight:600;">KWorkMate</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 0;color:#475569;">Reference:</td>
                    <td style="padding:3px 0;font-weight:700;color:#4338ca;">${invoiceNumber}</td>
                  </tr>
                </table>
                <div style="font-size:11.5px;color:#3b82f6;margin-top:10px;">
                  * Please use the <strong>Invoice Number (${invoiceNumber})</strong> as your payment reference.
                </div>
              </div>
            </td>
          </tr>

          ${notes ? `
          <tr>
            <td style="padding:0 36px 20px 36px;">
              <div style="background-color:#f8fafc;border-left:3px solid #64748b;padding:10px 14px;font-size:12px;color:#475569;">
                ${notes}
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <div style="font-size:12px;font-weight:600;color:#475569;">KWorkMate Pty Ltd</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:3px;">
                ABN: 96 804 937 141 · billing@kworkmate.com · Australia
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    
    // 호출자 인증: resolveCaller 또는 base44.auth.me()를 통한 슈퍼어드민 검증
    let me: any = await resolveCaller(base44, req).catch(() => null);
    if (!me) {
      me = await base44.auth.me().catch(() => null);
    }
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = Boolean(
      me.app_role === 'platform_admin' ||
      me.role === 'admin' ||
      me.isPlatformAdmin
    );
    if (!isPlatformAdmin) {
      return Response.json({ error: 'Forbidden: Super Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      company_id,
      invoice_email,
      invoice_number,
      plan_key = 'starter',
      plan_name = 'Starter',
      subtotal = 99,
      notes = ''
    } = body;

    if (!company_id || !invoice_email) {
      return Response.json({ error: 'company_id and invoice_email are required' }, { status: 400 });
    }

    const company = await base44.asServiceRole.entities.Company.get(company_id).catch(() => null);
    if (!company) {
      return Response.json({ error: 'Company not found' }, { status: 404 });
    }

    const companyName = company.name || 'Valued Client';
    const numSubtotal = Number(subtotal) || 99;
    const gst = Math.round(numSubtotal * 0.1 * 100) / 100;
    const total = Math.round((numSubtotal + gst) * 100) / 100;

    const todayDate = new Date();
    const issueDateStr = todayDate.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    const dueDateObj = new Date(todayDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const dueDateStr = dueDateObj.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });

    const invNum = invoice_number || `INV-${todayDate.getFullYear()}${String(todayDate.getMonth() + 1).padStart(2, '0')}-${(company.id || 'KWM').slice(-4).toUpperCase()}`;

    // 이메일 HTML 생성
    const html = buildInvoiceEmailHtml({
      companyName,
      invoiceNumber: invNum,
      issueDate: issueDateStr,
      dueDate: dueDateStr,
      planName,
      subtotal: numSubtotal,
      gst,
      total,
      notes
    });

    const subject = `[Tax Invoice] KWorkMate Subscription - ${invNum} (${companyName})`;

    // Resend 이메일 발송
    const sendResult = await sendEmailDetailed(base44, {
      to: invoice_email,
      subject,
      html
    });

    if (!sendResult.ok) {
      return Response.json({ error: sendResult.error || 'Failed to send email' }, { status: 500 });
    }

    // 1. invoices 테이블에 새 인보이스 이력 레코드 자동 저장 (초기 상태: unpaid)
    const todayIsoDate = todayDate.toISOString().slice(0, 10);
    const dueIsoDate = dueDateObj.toISOString().slice(0, 10);

    const createdInvoice = await base44.asServiceRole.entities.Invoice.create({
      company_id: company.id,
      invoice_number: invNum,
      issue_date: todayIsoDate,
      due_date: dueIsoDate,
      plan_key,
      plan_name,
      subtotal: numSubtotal,
      gst,
      total_amount: total,
      recipient_email: invoice_email,
      notes: notes || '',
      status: 'unpaid',
      paid_at: null
    }).catch((err: any) => {
      console.error('Failed to create invoice record:', err);
      return null;
    });

    // 2. Company 엔티티에 최근 인보이스 발송 이력 및 전용 이메일 저장
    const nowIso = new Date().toISOString();
    await base44.asServiceRole.entities.Company.update(company.id, {
      invoice_email: invoice_email,
      last_invoice_sent_at: nowIso,
      last_invoice_number: invNum,
      last_invoice_amount: total
    }).catch(() => null);

    return Response.json({
      success: true,
      invoice_number: invNum,
      invoice_id: createdInvoice?.id,
      sent_to: invoice_email,
      sent_at: nowIso,
      total_amount: total
    });
  } catch (err: any) {
    console.error('sendTaxInvoice error:', err);
    return Response.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

// Supabase Edge Runtime 표준 Deno.serve 서빙
Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
