const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "/api" : "")).replace(/\/+$/, "");

export async function api(path, options = {}, token) {
  if (!API_URL) {
    throw new Error("The store API is not configured. Set VITE_API_URL to your deployed API URL.");
  }
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the store right now. Check your connection and try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Something went wrong. Please try again.");
  return body;
}

export const money = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
}).format(amount || 0);
