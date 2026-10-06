import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { installKwAuth } from '@/lib/kwAuthClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// The platform client is created exactly as before. installKwAuth wraps it so that an employee
// who signed in with the ID and password their employer issued is answered by this app's own
// door, while a work-email sign-in keeps going straight to the platform.
export const base44 = installKwAuth(createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  appBaseUrl
}));