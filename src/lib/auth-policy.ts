type SupabaseIdentity = {
  is_anonymous?: boolean;
};

export function isGuestUser(user: SupabaseIdentity): boolean {
  return user.is_anonymous === true;
}

export function isPersistentUser(user: SupabaseIdentity): boolean {
  return user.is_anonymous === false;
}

export function validateGuestMigration(
  destination: SupabaseIdentity,
  guestUserId: string,
): { guestUserId: string } {
  if (!isPersistentUser(destination)) {
    throw new Error("Only a persistent account can migrate Guest history");
  }

  if (!guestUserId.trim()) {
    throw new Error("Guest session ID is required");
  }

  return { guestUserId: guestUserId.trim() };
}
