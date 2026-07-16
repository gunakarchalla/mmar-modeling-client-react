import { create } from "zustand";
import { jwtDecode } from "jwt-decode";
import { backendService } from "@/resources/services/backend-service";
import { getToken, setToken, clearToken } from "@/resources/services/token";
import { eventBus } from "@/resources/services/event-bus";
import { useLogStore } from "./logStore";

// Decoded-JWT view of the logged-in user. Replaces user-management.ts' token
// handling plus `globalObjectInstance.accessToken` (now mirrored via token.ts,
// which P2's globalObject.accessToken getter reads).
export interface CurrentUser {
  uuid: string;
  username: string;
  isAdmin: boolean;
}

interface JwtPayload {
  uuid?: string;
  username?: string;
  isAdmin?: boolean;
  exp?: number;
}

function decode(token: string): JwtPayload {
  return jwtDecode<JwtPayload>(token);
}

function userFromToken(token: string): CurrentUser {
  const payload = decode(token);
  return {
    uuid: payload.uuid ?? "",
    username: payload.username ?? "",
    isAdmin: payload.isAdmin === true,
  };
}

interface AuthState {
  currentUser: CurrentUser | null;

  /** POST credentials, store the token, hydrate currentUser, publish `login`. */
  login: (username: string, password: string) => Promise<boolean>;
  /** Clear the token + currentUser (old client just drops localStorage). */
  logout: () => void;
  /** True while a non-expired token is present. */
  isAuthenticated: () => boolean;
  /** Ported from user-management.isJwtExpired (no `exp` claim => treat as valid). */
  isJwtExpired: (token: string) => boolean;
  /** Restore session from localStorage["jwtToken"] at import time. */
  restore: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,

  async login(username: string, password: string): Promise<boolean> {
    try {
      const token = await backendService.login(username, password);
      // A valid JWT is a non-empty string; anything else is a failed login.
      if (!token || typeof token !== "string") return false;
      setToken(token);
      set({ currentUser: userFromToken(token) });
      useLogStore.getState().log(`User ${username} logged in`, "info");
      // §5 `login` channel: scenegroup (P7) inits the tree on this.
      eventBus.publish("login", true);
      return true;
    } catch (error) {
      // Wrong credentials return a non-ok response -> backendService.login throws.
      console.error("There was an error logging in:", error);
      return false;
    }
  },

  logout(): void {
    clearToken();
    set({ currentUser: null });
    useLogStore.getState().log("User logged out", "info");
    eventBus.publish("login", false);
  },

  isAuthenticated(): boolean {
    const token = getToken();
    return token !== null && !get().isJwtExpired(token);
  },

  isJwtExpired(token: string): boolean {
    const payload = decode(token);
    // Mirror user-management.isJwtExpired: no exp claim => not expired.
    if (!payload.exp) return false;
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime > payload.exp;
  },

  restore(): void {
    const token = getToken();
    if (!token) return;
    if (get().isJwtExpired(token)) {
      // Drop a stale token exactly like user-management.attached().
      clearToken();
      return;
    }
    set({ currentUser: userFromToken(token) });
  },
}));

// Hydrate currentUser from a stored token on page load (mirrors user-management.attached()).
useAuthStore.getState().restore();
