import React from 'react';
import { Menu, ShoppingBag, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 z-30 px-4 flex items-center justify-between transition-colors duration-300">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
        >
          <Menu size={24} />
        </button>
        <Link to="/" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-500">
          MODIFY
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <Link to="/cart" className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors relative">
          <ShoppingBag size={24} />
          {/* 장바구니 뱃지 예시 */}
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></span>
        </Link>
        <Link to="/virtual-fitting" className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors relative">
          <Camera size={24} />
          {/* 가상 피팅 뱃지 예시 */}
        </Link>
      </div>
    </header>
  );
}