import { Navigate } from 'react-router-dom';

// A visitor who has not signed in lands on the public first screen; anywhere deeper keeps
// pointing at the sign-in page with a way back to where they were headed.
export default function FirstVisit() {
  const here = window.location.pathname + window.location.search;
  if (here === '/') return <Navigate to="/welcome" replace />;
  return <Navigate to={`/login?returnTo=${encodeURIComponent(here)}`} replace />;
}