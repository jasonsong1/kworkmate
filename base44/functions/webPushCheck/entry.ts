import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Temporary diagnostic: can a deployed function reach the new entity as the app user,
// as the service role, and can it read an existing entity the same two ways?
export default async function (req: Request): Promise<Response> {
  const out: any = {};
  const base44 = createClientFromRequest(req);

  try {
    const page = await base44.entities.PushSubscription.filter({}, { limit: 1 });
    out.userScopedNew = `page:${(page.items || []).length}`;
  } catch (error: any) {
    out.userScopedNewError = error.message;
  }

  try {
    const page = await base44.asServiceRole.entities.PushSubscription.filter({}, { limit: 1 });
    out.serviceScopedNew = `page:${(page.items || []).length}`;
  } catch (error: any) {
    out.serviceScopedNewError = error.message;
  }

  try {
    const page = await base44.entities.Notification.filter({}, { limit: 1 });
    out.userScopedExisting = `page:${(page.items || []).length}`;
  } catch (error: any) {
    out.userScopedExistingError = error.message;
  }

  try {
    const me = await base44.auth.me();
    out.me = me ? me.email : 'none';
  } catch (error: any) {
    out.meError = error.message;
  }

  return Response.json(out);
}