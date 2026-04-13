export type NavigationItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
};

export const studentNavigation: NavigationItem[] = [
  { href: "/", label: "Home", icon: "/assets/icons8-home-48.png", exact: true },
  { href: "/payments", label: "Payments", icon: "/assets/icons8-cash-and-credit-card-50.png" },
  { href: "/messages", label: "Messages", icon: "/assets/icons8-message.png" },
  { href: "/profile", label: "Profile", icon: "/assets/icons8-profile-24.png" },
];

export const teacherNavigation: NavigationItem[] = [
  { href: "/lecturer", label: "Lecturer", icon: "/assets/icons8-lecturer-50.png", exact: true },
  { href: "/analytics", label: "Analytics", icon: "/assets/icons8-cash-and-credit-card-50.png" },
  { href: "/profile", label: "Profile", icon: "/assets/icons8-profile-24.png" },
];

export const adminNavigation: NavigationItem[] = [
  { href: "/admin", label: "Dashboard", icon: "/assets/icons8-home-48.png", exact: true },
  { href: "/analytics", label: "Analytics", icon: "/assets/icons8-cash-and-credit-card-50.png" },
  { href: "/profile", label: "Profile", icon: "/assets/icons8-profile-24.png" },
];
