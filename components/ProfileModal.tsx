
// This file is deprecated in favor of SmartDashboard.tsx but updated to prevent build errors.
import React from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, Trophy, Flame } from 'lucide-react';

interface ProfileModalProps {
  user: UserProfile;
  messages: ChatMessage[];
  onClose: () => void;
  onUpgrade: () => void;
  onUpdateUser: (user: UserProfile) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, onClose, onLogout }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white p-8 rounded-2xl max-w-sm w-full text-center">
        <h2 className="text-2xl font-bold mb-4">Profil (Obsolète)</h2>
        <p className="mb-4">Crédits: {user.credits}</p>
        <button onClick={onClose} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Fermer</button>
      </div>
    </div>
  );
};

export default ProfileModal;
