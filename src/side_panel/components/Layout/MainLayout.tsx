import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { PencilSquareIcon, LinkIcon, ChatBubbleLeftRightIcon, TagIcon } from '@heroicons/react/24/solid';

export const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getTabClass = (path: string) => 
    location.pathname === path 
      ? "text-blue-600" 
      : "text-gray-400 hover:text-gray-600";

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </div>

      {/* Fixed Bottom Nav */}
      <div className="fixed bottom-0 w-full h-14 bg-white border-t border-slate-200 flex justify-around items-center shadow-lg z-50">
        
        <button onClick={() => navigate('/')} className={`flex flex-col items-center p-2 w-full ${getTabClass('/')}`}>
          <PencilSquareIcon className="h-6 w-6" />
          <span className="text-[10px] font-medium">Create</span>
        </button>

        <button onClick={() => navigate('/relations')} className={`flex flex-col items-center p-2 w-full ${getTabClass('/relations')}`}>
          <LinkIcon className="h-6 w-6" />
          <span className="text-[10px] font-medium">Link</span>
        </button>

        <button onClick={() => navigate('/qa')} className={`flex flex-col items-center p-2 w-full ${getTabClass('/qa')}`}>
          <ChatBubbleLeftRightIcon className="h-6 w-6" />
          <span className="text-[10px] font-medium">Q&A</span>
        </button>

        <button onClick={() => navigate('/taxonomy')} className={`flex flex-col items-center p-2 w-full ${getTabClass('/taxonomy')}`}>
          <TagIcon className="h-6 w-6" />
          <span className="text-[10px] font-medium">Tags</span>
        </button>

      </div>
    </div>
  );
};
