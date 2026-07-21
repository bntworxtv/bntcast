const API_BASE = '/api';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers as any },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  auth: {
    login: (email: string, password: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (email: string, password: string, name: string) => request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' })
  },
  stations: {
    list: () => request('/stations'),
    get: (id: string) => request(`/stations/${id}`),
    create: (data: any) => request('/stations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/stations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/stations/${id}`, { method: 'DELETE' }),
    start: (id: string) => request(`/stations/${id}/start`, { method: 'POST' }),
    stop: (id: string) => request(`/stations/${id}/stop`, { method: 'POST' }),
    status: (id: string) => request(`/stations/${id}/status`)
  },
  media: {
    list: (stationId: string) => request(`/media/${stationId}`),
    upload: async (stationId: string, files: File[]) => {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      const res = await fetch(`${API_BASE}/media/${stationId}/upload`, {
        method: 'POST', credentials: 'include', body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },
    delete: (stationId: string, mediaId: string) => request(`/media/${stationId}/${mediaId}`, { method: 'DELETE' })
  },
  playlists: {
    list: (stationId: string) => request(`/playlists/${stationId}`),
    create: (stationId: string, data: any) => request(`/playlists/${stationId}`, { method: 'POST', body: JSON.stringify(data) }),
    addMedia: (stationId: string, playlistId: string, mediaIds: string[]) =>
      request(`/playlists/${stationId}/${playlistId}/add`, { method: 'POST', body: JSON.stringify({ mediaIds }) }),
    delete: (stationId: string, playlistId: string) => request(`/playlists/${stationId}/${playlistId}`, { method: 'DELETE' })
  },
  stream: {
    info: (shortcode: string) => request(`/stream/live/${shortcode}`),
    status: (shortcode: string) => request(`/stream/status/${shortcode}`),
    nowPlaying: (shortcode: string) => request(`/stream/nowplaying/${shortcode}`)
  },
  listeners: {
    live: (stationId: string) => request(`/listeners/live/${stationId}`),
    history: (stationId: string) => request(`/listeners/${stationId}`),
    stats: (stationId: string) => request(`/listeners/${stationId}/stats`)
  },
  schedule: {
    list: (stationId: string) => request(`/schedule/${stationId}`),
    create: (stationId: string, data: any) => request(`/schedule/${stationId}`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (stationId: string, eventId: string) => request(`/schedule/${stationId}/${eventId}`, { method: 'DELETE' })
  },
  system: {
    info: () => request('/system/info'),
    engines: () => request('/system/stream-engines')
  }
};
