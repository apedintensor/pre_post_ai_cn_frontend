import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUserStore } from '../userStore';

const mockUser = {
  id: 42,
  email: 'demo@example.com',
  is_active: true,
  is_superuser: false,
  is_verified: true,
  role_id: null,
  age_bracket: null,
  gender: null,
  years_experience: null,
  years_derm_experience: null,
  created_at: new Date().toISOString()
};

const NEW_USER_KEY = `new_user_flag_${mockUser.id}`;

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => (key in storage ? storage[key] : null),
  setItem: (key: string, value: string) => {
    storage[key] = value;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    Object.keys(storage).forEach(key => delete storage[key]);
  }
};

beforeEach(() => {
  mockLocalStorage.clear();
  vi.stubGlobal('localStorage', mockLocalStorage);
  setActivePinia(createPinia());
});

describe('userStore new user flag', () => {
  it('defaults to new user when no persisted state exists', () => {
    const store = useUserStore();
    expect(store.isNewUser).toBe(true);
  });

  it('persists new user state keyed by user id', () => {
    const store = useUserStore();
    store.user = { ...mockUser } as any;
    store.setIsNewUser(false);

    expect(store.isNewUser).toBe(false);
    expect(localStorage.getItem(NEW_USER_KEY)).toBe('false');

    store.setIsNewUser(true);
    expect(store.isNewUser).toBe(true);
    expect(localStorage.getItem(NEW_USER_KEY)).toBe('true');
  });

  it('restores persisted flag during loadFromLocalStorage', () => {
    localStorage.setItem('access_token', 'token');
    localStorage.setItem('userData', JSON.stringify(mockUser));
    localStorage.setItem(NEW_USER_KEY, 'false');

    const store = useUserStore();
    expect(store.isNewUser).toBe(false);
  });

  it('clears persisted state on logout', () => {
    const store = useUserStore();
    store.user = { ...mockUser } as any;
    store.setIsNewUser(false);
    expect(localStorage.getItem(NEW_USER_KEY)).toBe('false');

    store.clearAuth();
    expect(store.isNewUser).toBe(true);
    expect(localStorage.getItem(NEW_USER_KEY)).toBeNull();
  });

  it('applies heuristic updates based on report/assignment presence', () => {
    const store = useUserStore();
    store.user = { ...mockUser } as any;
    store.setIsNewUser(true);

    store.evaluateNewUserHeuristic({ hasCompletedReports: true, hasActiveAssignment: false });
    expect(store.isNewUser).toBe(false);

    store.evaluateNewUserHeuristic({ hasCompletedReports: false, hasActiveAssignment: true });
    expect(store.isNewUser).toBe(false);

    store.evaluateNewUserHeuristic({ hasCompletedReports: false, hasActiveAssignment: false });
    expect(store.isNewUser).toBe(true);
  });
});
