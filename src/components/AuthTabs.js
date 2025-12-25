'use client';

import { useState } from 'react';
import Login from './Login';
import Register from './Register';

export default function AuthTabs() {
  const [activeTab, setActiveTab] = useState('login');

  return (
    <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <div className="space-y-4">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('login')}
              className={`py-2 px-4 text-sm font-medium cursor-pointer ${
                activeTab === 'login'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`py-2 px-4 text-sm font-medium cursor-pointer ${
                activeTab === 'register'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Register
            </button>
          </div>
          <div className="pt-4">
            {activeTab === 'login' ? <Login /> : <Register />}
          </div>
        </div>
      </div>
    </div>
  );
}