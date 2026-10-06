// Passwords belong to the platform, so account access is always handed over by email:
// an invitation creates the account for a brand new address, then the platform's
// single-use reset link is what lets the person set their first password.

// An address the platform already knows needs no second invitation: the employer's records are
// what let it back in, so that is reported instead of failing the whole call.
export async function inviteAccount(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return { invited: false, existing: false, error: 'Email is required' };
  const users = await base44.asServiceRole.entities.User.filter({ email: target });
  if (users.length > 0) return { invited: false, existing: true, error: null };
  try {
    await base44.asServiceRole.users.inviteUser(target, 'user');
    return { invited: true, existing: false, error: null };
  } catch (error) {
    console.error('inviteUser failed:', error && error.message);
    return { invited: false, existing: false, error: (error && error.message) || 'Invitation could not be sent' };
  }
}

// The platform's reset link is the only way to a first password, so the reason a send failed
// travels back with the answer instead of being swallowed.
export async function sendPasswordSetupEmail(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return { sent: false, error: 'Email is required' };
  try {
    await base44.auth.resetPasswordRequest(target);
    return { sent: true, error: null };
  } catch (error) {
    console.error('resetPasswordRequest failed:', error && error.message);
    return { sent: false, error: (error && error.message) || 'Email could not be sent' };
  }
}

// Invite first: the reset link only reaches an address that already has an account. The answer
// says what actually happened, so the back office can tell the employer where the person stands.
export async function sendAccountAccessEmail(base44, email, sendPassword = true) {
  const invite = await inviteAccount(base44, email);
  const password = sendPassword ? await sendPasswordSetupEmail(base44, email) : { sent: false, error: null };
  return {
    invited: invite.invited,
    existing: invite.existing,
    password_email_sent: password.sent,
    email_error: invite.error || password.error
  };
}

// Whether the employer's records still admit this address: an employee profile at any company,
// a company member list, or a branch manager list.
export async function hasAppAccess(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return false;
  const [profiles, companies, branches] = await Promise.all([
    base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: target }),
    base44.asServiceRole.entities.Company.filter({ member_emails: target }),
    base44.asServiceRole.entities.Branch.filter({ manager_emails: target })
  ]);
  return profiles.length > 0 || companies.length > 0 || branches.length > 0;
}

// Removing the last record that admitted an address closes the app for that account again. The
// sign-in itself stays with the platform, so only the workspace is dropped — the same email
// registered anew is linked once more on the next sign-in. A record kept elsewhere (another
// company's employee profile, a member or manager list) leaves the account untouched.
export async function releaseAppAccess(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return { blocked: false, kept: false };
  if (await hasAppAccess(base44, target)) return { blocked: false, kept: true };

  // The platform admin runs the app itself rather than a company inside it, so their own
  // account is never touched.
  const accounts = await base44.asServiceRole.entities.User.filter({ email: target });
  if (!accounts.some((account) => account.role !== 'admin')) return { blocked: false, kept: false };

  await base44.asServiceRole.entities.User.updateMany(
    { email: target, role: { $ne: 'admin' } },
    {
      $unset: { company_id: '', branch_id: '', branch_ids: '' },
      $set: { app_role: 'staff' }
    }
  );
  return { blocked: true, kept: false };
}