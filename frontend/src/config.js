// Centralized Frontend Configuration
// Uses environment variables in production, and falls back to proxy-based paths in local dev.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
