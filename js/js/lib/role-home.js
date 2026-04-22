// js/lib/role-home.js

export function roleHome(role) {
  if (role === "admin")   return "admin.html";
  if (role === "company") return "dashboard-company.html";
  return "dashboard.html";
}
