import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const jobId = body.job_id;
    const slug = String(body.slug || '')
      .trim()
      .toLowerCase()
      .replace(/^\/+|\/+$/g, '');
    if (!jobId && !slug) return Response.json({ error: 'job_id is required' }, { status: 400 });

    let job = jobId ? await base44.asServiceRole.entities.Job.get(jobId).catch(() => null) : null;
    if (!job && slug) {
      const matches = await base44.asServiceRole.entities.Job.filter({ slug });
      job = matches[0] || null;
    }
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    const branch = job.branch_id
      ? await base44.asServiceRole.entities.Branch.get(job.branch_id).catch(() => null)
      : null;
    const company = job.company_id
      ? await base44.asServiceRole.entities.Company.get(job.company_id).catch(() => null)
      : null;

    return Response.json({
      ok: true,
      job: {
        id: job.id,
        title: job.title,
        position: job.position || '',
        employment_type: job.employment_type || 'casual',
        hourly_rate: job.hourly_rate || 0,
        description: job.description || '',
        status: job.status || 'draft',
        required_questions: job.required_questions || [],
        custom_questions: job.custom_questions || [],
        logo_url: job.logo_url || '',
        header_image_url: job.header_image_url || '',
        slug: job.slug || '',
        brand_color: job.brand_color || '#4338ca',
        location: job.postal_address || ''
      },
      branch: branch
        ? {
            id: branch.id,
            name: branch.name,
            address: branch.address || '',
            suburb: branch.suburb || '',
            state: branch.state || '',
            postcode: branch.postcode || '',
            phone: branch.phone || '',
            trading_hours: branch.trading_hours || '',
            logo_url: branch.logo_url || '',
            brand_color: branch.brand_color || '#4338ca'
          }
        : null,
      company: company ? { id: company.id, name: company.name, logo_url: company.logo_url || '' } : null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}