
import { User, UserProfile } from '../types';

interface AuthResponse {
    profile: UserProfile;
    role: string;
    username: string;
}

export const authService = {
    async getSession(): Promise<User | null> {
        try {
            const res = await fetch('/api/validate', { method: 'GET', credentials: 'include' });
            if (!res.ok) return null;
            const data: AuthResponse = await res.json();
            return {
                id: data.username, // Using username as ID for now or profile email
                name: data.profile?.displayName || 'User',
                email: data.username,
                accessLevel: data.role === 'admin' ? 'Admin' : 'Student', // Mapping simplified
                avatar: `https://ui-avatars.com/api/?name=${data.profile?.displayName || 'User'}&background=random`,
                profile: data.profile
            };
        } catch {
            return null;
        }
    },

    async login(email: string, password: string): Promise<User> {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: email, password }),
            credentials: 'include'
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Login failed');
        }

        const data: AuthResponse = await res.json();
        return {
            id: email,
            name: data.profile?.displayName || 'User',
            email: email,
            accessLevel: data.role === 'admin' ? 'Admin' : 'Student',
            avatar: `https://ui-avatars.com/api/?name=${data.profile?.displayName || 'User'}&background=random`,
            profile: data.profile
        };
    },

    async logout(): Promise<void> {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    },

    async register(email: string, password: string, displayName: string): Promise<User> {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, displayName }),
            credentials: 'include'
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Registration failed');
        }

        const data: AuthResponse = await res.json();
        return {
            id: email,
            name: data.profile?.displayName || 'User',
            email: email,
            accessLevel: 'Student',
            avatar: `https://ui-avatars.com/api/?name=${displayName}&background=random`,
            profile: data.profile
        };
    },

    async updateProfile(profileData: any): Promise<void> {
        await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData),
            credentials: 'include'
        });
    }
};

