import apiClient from './apiClient';

export const robotService = {
    getAll: async () => {
        const response = await apiClient.get('/Robots');
        return response.data;
    },
    getById: async (id) => {
        const response = await apiClient.get(`/Robots/${id}`);
        return response.data;
    },
    create: async (data) => {
        const response = await apiClient.post('/Robots', data);
        return response.data;
    },
    update: async (id, data) => {
        const response = await apiClient.put(`/Robots/${id}`, data);
        return response.data;
    },
    delete: async (id) => {
        const response = await apiClient.delete(`/Robots/${id}`);
        return response.data;
    }
};