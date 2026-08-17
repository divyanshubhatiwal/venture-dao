/**
 * Centralized Auth Token Store for decoupled frontend/backend deployments.
 *
 * Saves session token to sessionStorage/localStorage and automatically creates
 * Authorization headers so cross-site requests never drop authentication.
 */

const TOKEN_KEY = 'vd_auth_token'

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
      sessionStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // Ignore storage quota or disabled storage in incognito
  }
}

export function getAuthHeaders(existingHeaders = {}) {
  const token = getAuthToken()
  const headers = { ...existingHeaders }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}
