class API {
  static async request(endpoint, options = {}) {
    const defaultOptions = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };
    
    if (mergedOptions.body && typeof mergedOptions.body !== 'string') {
      mergedOptions.body = JSON.stringify(mergedOptions.body);
    }
    
    try {
      const response = await fetch(`/api${endpoint}`, mergedOptions);
      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login.html';
          throw new Error(data.message || 'Authentication required');
        }
        throw new Error(data.message || 'Request failed');
      }
      
      return data;
    } catch (error) {
      if (error.name === 'TypeError') {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  }
  
  static get(endpoint) {
    return this.request(endpoint);
  }
  
  static post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: data
    });
  }
  
  static patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: data
    });
  }
  
  static delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }
  
  static async upload(endpoint, formData) {
    try {
      const response = await fetch(`/api${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }
      
      return data;
    } catch (error) {
      if (error.name === 'TypeError') {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  }
}
