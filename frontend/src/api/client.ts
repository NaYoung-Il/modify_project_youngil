import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore'; 

// 🚨 환경 변수 또는 하드코딩된 주소 사용
// 배포 환경에서는 import.meta.env.VITE_API_URL 등을 사용하세요.
const API_ROOT = 'http://localhost:8000'; 
const API_BASE_URL = `${API_ROOT}/api/v1`;

// Axios 인스턴스 생성 (기본 URL에 /api/v1 포함됨)
const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, 
  withCredentials: true, 
});

// 재시도 플래그 (무한 루프 방지)
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else if (token) {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// --------------------------------------------------
// 2. Request Interceptor: 모든 요청에 Access Token 주입
// --------------------------------------------------
client.interceptors.request.use((config) => {
  const { token } = useAuthStore.getState();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --------------------------------------------------
// 3. Response Interceptor: 401 에러 자동 처리 (토큰 갱신)
// --------------------------------------------------
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    
    // 조건: 401 에러 + 아직 재시도 안 함 + 로그인/토큰 갱신 요청 아님
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/login')) {
        
        // 1. 첫 번째 401 에러가 발생했을 때만 리프레시 로직 시작
        if (!isRefreshing) {
            isRefreshing = true;
            originalRequest._retry = true; 

            const { refreshToken, setAccessToken, logout, user } = useAuthStore.getState();
            
            if (!refreshToken || !user) {
                console.error("🔒 No refresh token/user found. Redirecting to login.");
                logout();
                return Promise.reject(error);
            }

            // 🆕 Refresh Token으로 새 Access Token 요청
            try {
                // client 인스턴스가 아닌 axios를 직접 사용하여 Interceptor 순환 방지
                // 🚨 주의: API_ROOT + /api/v1 경로를 정확히 조합
                const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                    refresh_token: refreshToken
                });

                const { access_token: newAccessToken } = refreshResponse.data;

                // 1. 스토어에 새 Access Token 저장
                setAccessToken(newAccessToken);

                // 2. 대기열에 쌓인 요청들 처리
                processQueue(null, newAccessToken);
                
                // 3. 실패했던 원본 요청의 헤더를 새 토큰으로 교체하고 재시도
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return client(originalRequest);

            } catch (refreshError) {
                // Refresh Token 만료 -> 강제 로그아웃
                processQueue(error, null); 
                console.error("🔒 Refresh failed. Session expired completely.");
                logout();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
        
        // 2. 토큰 갱신 중 다른 401 에러 발생 시 대기열에 추가
        return new Promise((resolve, reject) => {
            failedQueue.push({ resolve: (token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(client(originalRequest));
            }, reject });
        });
    }
    
    return Promise.reject(error);
  }
);

export default client;