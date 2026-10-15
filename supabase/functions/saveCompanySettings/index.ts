import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

const ALLOWED_KEYS = [
  'name',
  'abn',
  'contact_email',
  'contact_phone',
  'default_super_fund_name',
  'default_super_fund_abn',
  'default_super_fund_usi',
  'default_super_fund_phone',
  'ai_top_n',
  'auto_reject_email',
  'mini_interview_enabled',
  'video_interview_enabled',
  'screening_criteria',
  'interview_questions',
  'video_interview_questions',
  'pay_multipliers',
  'role_permissions',
  'custom_roles',
  'onboarding_docs',
  'onboarding_questions',
  'onboarding_doc_types',
  'onboarding_field_visibility',
  'tfn_employer_signature'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id;
    if (!companyId) {
      return new Response(JSON.stringify({ error: 'company_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const incoming = body.data && typeof body.data === 'object' ? body.data : {};
    const patch: Record<string, any> = {};
    ALLOWED_KEYS.forEach((key) => {
      if (key in incoming) patch[key] = incoming[key];
    });

    if (Object.keys(patch).length === 0) {
      return new Response(JSON.stringify({ error: 'Nothing to save' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: updated, error } = await supabase
      .from('company')
      .update(patch)
      .eq('id', companyId)
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, company: updated }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
