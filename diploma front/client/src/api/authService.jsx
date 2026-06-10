import apiClient from './apiClient';

export const authService = {
    register: async (email, password) => {
        const response = await apiClient.post('/Auth/register', { email, password });
        return response.data;
    },

    login: async (email, password) => {
        const response = await apiClient.post('/Auth/login', { email, password });
        if (response.data?.token) {
            localStorage.setItem('token', response.data.token);
        }
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('token');
    },

    getUserRole: () => {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const payloadBase64 = token.split('.')[1];
            const decodedPayload = JSON.parse(atob(payloadBase64));
            let userRole = decodedPayload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || 'viewer';
            if (Array.isArray(userRole)) userRole = userRole[0];
            return userRole.toLowerCase();
        } catch (e) {
            return null;
        }
    }
};