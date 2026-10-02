// Passwords belong to the platform, so account access is always handed over by email:
// an invitation creates the account for a brand new address, then the platform's
// single-use reset link is what lets the person set their first password.
export async function inviteIfNew(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return false;
  const users = await base44.asServiceRole.entities.User.filter({ email: target });
  if (users.length > 0) return false;
  try {
    await base44.asServiceRole.users.inviteUser(target, 'user');
    return true;
  } catch (error) {
    console.error('inviteUser failed:', error && error.message);
    return false;
  }
}

export async function sendPasswordSetupEmail(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return false;
  try {
    await base44.auth.resetPasswordRequest(target);
    return true;
  } catch (error) {
    console.error('resetPasswordRequest failed:', error && error.message);
    return false;
  }
}

// Invite first: the reset link only reaches an address that already has an account.
export async function sendAccountAccessEmail(base44, email) {
  const invited = await inviteIfNew(base44, email);
  const passwordEmail = await sendPasswordSetupEmail(base44, email);
  return { invited, passwordEmail };
}