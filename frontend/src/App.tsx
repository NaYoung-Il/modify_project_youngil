// App.tsx (수정)

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUIStore } from '@/store/uiStore';

import Layout from '@/components/layout/Layout';
import Home from '@/pages/Home';
import Search from '@/pages/Search';
import Login from '@/pages/Login';
import ProductDetail from '@/pages/ProductDetail';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import VirtualFitting from '@/pages/VirtualFitting';

import Dashboard from '@/pages/admin/Dashboard';
import ProductUpload from '@/pages/admin/ProductUpload';
import AdminRoute from '@/components/routes/AdminRoute'; 

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const { isDarkMode } = useUIStore();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/virtual-fitting" element={<VirtualFitting />} />
              
              {/* 🚨 수정: 관리자 라우트를 AdminRoute로 보호 */}
              <Route element={<AdminRoute />}> 
                <Route path="/admin" element={<Dashboard />} />
                <Route path="/admin/upload" element={<ProductUpload />} />
              </Route>
            </Route>
            
            <Route path="/login" element={<Login />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}