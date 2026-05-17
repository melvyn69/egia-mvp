const adminEmails = new Set(
  String(import.meta.env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean)
);

const isAdminUser = (email?: string | null) => {
  if (!email) {
    return false;
  }
  return adminEmails.has(email.trim().toLowerCase());
};

export { isAdminUser };
