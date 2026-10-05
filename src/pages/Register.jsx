import React from "react";
import { Navigate } from "react-router-dom";
import { safeReturnTo } from "@/lib/authReturnTo";

// Accounts are opened by the employer, so there is no self-service sign-up here: a visit
// to this address simply returns to the sign-in screen.
export default function Register() {
  const returnTo = safeReturnTo();
  const target =
    returnTo && returnTo !== "/"
      ? `/login?returnTo=${encodeURIComponent(returnTo)}`
      : "/login";

  return <Navigate to={target} replace />;
}