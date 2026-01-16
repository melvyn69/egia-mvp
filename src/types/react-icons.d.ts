declare module "react-icons/fa" {
  const icons: Record<string, React.ComponentType<{ className?: string; size?: number }>>;
  export const FaGoogle: React.ComponentType<{ className?: string; size?: number }>;
  export const FaFacebookF: React.ComponentType<{ className?: string; size?: number }>;
  export const FaInstagram: React.ComponentType<{ className?: string; size?: number }>;
  export default icons;
}

declare module "react-icons/si" {
  const icons: Record<string, React.ComponentType<{ className?: string; size?: number }>>;
  export const SiTripadvisor: React.ComponentType<{ className?: string; size?: number }>;
  export default icons;
}
