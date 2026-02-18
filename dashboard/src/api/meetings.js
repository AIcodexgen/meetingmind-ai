import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.meetingmind.ai';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getMeetings = async (params = {}) => {
  try {
    const response = await api.get('/api/meetings', { params });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getMeeting = async (id) => {
  try {
    const response = await api.get(`/api/meetings/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const deleteMeeting = async (id) => {
  try {
    const response = await api.delete(`/api/meetings/${id}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const generateShareLink = async (meetingId, options = {}) => {
  try {
    const response = await api.post(`/api/meetings/${meetingId}/share`, options);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const updateActionItem = async (meetingId, actionItemId, updates) => {
  try {
    const response = await api.patch(
      `/api/meetings/${meetingId}/action-items/${actionItemId}`, 
      updates
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const exportMeeting = async (meetingId, format = 'pdf') => {
  try {
    const response = await api.get(
      `/api/meetings/${meetingId}/export?format=${format}`,
      { responseType: 'blob' }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const syncToCRM = async (meetingId, crmType, dealId) => {
  try {
    const response = await api.post(`/api/meetings/${meetingId}/sync-crm`, {
      crmType,
      dealId
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const searchTranscripts = async (query) => {
  try {
    const response = await api.get('/api/meetings/search', {
      params: { q: query }
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};
