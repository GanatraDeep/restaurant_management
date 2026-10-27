// A user is an F Cartel super admin (platform operator) when flagged in the
// database or when their email is listed in SUPER_ADMIN_EMAILS
// (comma-separated) — the env list is how the first super admin is
// bootstrapped on a fresh install.
export function superAdminEmails(): Set<string> {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSuperAdminUser(user: {
  isSuperAdmin?: boolean | null;
  email?: string | null;
}): boolean {
  if (user.isSuperAdmin) return true;
  return !!user.email && superAdminEmails().has(user.email.toLowerCase());
}
