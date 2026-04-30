const AUTH_TOKEN_KEY = "sau-auth-token";

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function setToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${window.location.origin}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Erreur serveur");
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function login(username, password) {
  const payload = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(payload.token || "");
  return payload.user;
}

export async function logout() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } finally {
    setToken("");
  }
}

export async function getCurrentUser() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = await apiRequest("/api/auth/me");
    return payload.user || null;
  } catch (error) {
    setToken("");
    return null;
  }
}

export async function listUsers() {
  return apiRequest("/api/users");
}

export async function createUser(user) {
  return apiRequest("/api/users", {
    method: "POST",
    body: JSON.stringify(user),
  });
}

export async function toggleUserActive(userId, isActive) {
  return apiRequest("/api/users/toggle-active", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, is_active: isActive }),
  });
}

export async function getTrainingContent() {
  return apiRequest("/api/training");
}

export async function saveTrainingContent(categories) {
  return apiRequest("/api/training", {
    method: "POST",
    body: JSON.stringify({ categories }),
  });
}

export async function saveTrainingAttempt(attempt) {
  return apiRequest("/api/training/attempt", {
    method: "POST",
    body: JSON.stringify(attempt),
  });
}