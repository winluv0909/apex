// Read access and report generation are separate from data changes.
// Roles must come from the authenticated user's database profile.
export function canViewDashboard(role: unknown): boolean {
  return role === "owner" || role === "viewer";
}

export function canManageData(role: unknown): boolean {
  return role === "owner";
}
