// ============================================================
// app-params.js
// 목적: 앱 설정 및 파라미터 관리 (Base44 SDK 의존성 완전 제거 버전)
// ============================================================

const isNode = typeof window === 'undefined';

function getAccessToken() {
  if (isNode) return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('access_token');
    if (tokenFromUrl) return tokenFromUrl;
    return window.localStorage.getItem('base44_access_token') || window.localStorage.getItem('token') || null;
  } catch (e) {
    return null;
  }
}

const isClearAccessTokenRequested = () =>
  !isNode && new URLSearchParams(window.location.search).get('clear_access_token') === 'true';

const clearStoredAccessToken = () => {
  if (isNode) return;
  window.localStorage.removeItem('base44_access_token');
  window.localStorage.removeItem('token');
};

const getAppParams = () => {
  if (isClearAccessTokenRequested()) {
    clearStoredAccessToken();
  }
  return {
    appId: import.meta.env.VITE_BASE44_APP_ID || '',
    token: getAccessToken(),
    functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION || '',
    appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL || ''
  };
};

export const appParams = {
  ...getAppParams()
};
