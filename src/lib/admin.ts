const adminEmails = new Set(
  String(import.meta.env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email: string) => email.trim().toLowerCase())
    .filter(Boolean)
);

const developerEmails = new Set(
  String(import.meta.env.VITE_DEVELOPER_EMAILS ?? "")
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

const isDeveloperUser = (email?: string | null) => {
  if (!email) {
    return false;
  }
  return developerEmails.has(email.trim().toLowerCase());
};

export { isAdminUser, isDeveloperUser };
