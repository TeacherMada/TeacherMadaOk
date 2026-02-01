
import React, { useState, useEffect } from 'react';
import { UserProfile, SystemSettings, AdminRequest } from '../types';
import { storageService } from '../services/storageService';
import { Users, CreditCard, Settings, Search, Save, Key, UserCheck, UserX, LogOut, ArrowLeft, MessageSquare, Check, X, Plus, Minus, Lock, CheckCircle, RefreshCw, MessageCircle, AlertTriangle, Globe, Banknote, Flag } from 'lucide-react';

interface AdminDashboardProps {
  currentUser: UserProfile;
  onLogout: () => void;
  onBack: () => void;
  isDarkMode: boolean;
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onLogout, onBack, isDarkMode, notify }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'requests' | 'settings' | 'languages'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState<SystemSettings>(storageService.getSystemSettings());
  const [loading, setLoading] = useState(false);
  
  // Custom Language State (MANUAL ADDITION)
  const [newLangName, setNewLangName] = useState('');
  const [newLangFlag, setNewLangFlag] = useState('');

  // Auto-Validation State
  const [newTransactionRef, setNewTransactionRef] = useState('');

  // Manual Credit Input State (Key: userId, Value: amount string)
  const [manualCreditInputs, setManualCreditInputs] = useState<Record<string, string>>({});
  // Password Input State (Key: userId, Value: password string)
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    setLoading(true);
    try {
        const [fetchedUsers, fetchedRequests] = await Promise.all([
            storageService.getAllUsers(),
            storageService.getAdminRequests()
        ]);
        setUsers(fetchedUsers);
        setRequests(fetchedRequests);
        setSettings(storageService.getSystemSettings());
    } catch (e) {
        notify("Erreur lors du chargement des données.", 'error');
    } finally {
        setLoading(false);
    }
  };

  const handleManualCreditChange = (userId: string, val: string) => {
      setManualCreditInputs(prev => ({ ...prev, [userId]: val }));
  };

  const executeManualCredit = async (userId: string, multiplier: number) => {
      const val = parseInt(manualCreditInputs[userId] || '0');
      if (!isNaN(val) && val !== 0) {
          const finalAmt = val * multiplier;
          await storageService.addCredits(userId, finalAmt);
          setManualCreditInputs(prev => ({ ...prev, [userId]: '' })); // Reset
          await refreshData();
          notify(`Crédits ${finalAmt > 0 ? 'ajoutés' : 'retirés'}: ${finalAmt}`, 'success');
      }
  };

  const handlePasswordChange = (userId: string, val: string) => {
      setPasswordInputs(prev => ({ ...prev, [userId]: val }));
  };

  const saveNewPassword = (user: UserProfile) => {
      const newPass = passwordInputs[user.id];
      if (newPass && newPass.trim().length > 0) {
          storageService.saveUserProfile({ ...user, password: newPass });
          setPasswordInputs(prev => ({ ...prev, [user.id]: '' }));
          notify(`Mot de passe pour ${user.username} mis à jour.`, 'success');
      }
  };

  const toggleSuspend = (user: UserProfile) => {
      const updated = { ...user, isSuspended: !user.isSuspended };
      storageService.saveUserProfile(updated);
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
      notify(`Utilisateur ${updated.isSuspended ? 'suspendu' : 'réactivé'}.`, 'info');
  };

  const handleResolveRequest = async (reqId: string, status: 'approved' | 'rejected') => {
      await storageService.resolveRequest(reqId, status);
      await refreshData();
      notify(`Demande ${status === 'approved' ? 'approuvée' : 'rejetée'}.`, status === 'approved' ? 'success' : 'info');
  };

  const saveSettings = async () => {
      await storageService.updateSystemSettings(settings);
      notify("Paramètres système sauvegardés et synchronisés.", 'success');
  };

  const handleAddLanguage = async () => {
      if (!newLangName.trim() || !newLangFlag.trim()) {
          notify("Nom et Drapeau requis.", 'error');
          return;
      }
      
      try {
          const code = `${newLangName} ${newLangFlag}`;
          const newLang = { code: code, baseName: newLangName, flag: newLangFlag };
          
          const updatedSettings = {
              ...settings,
              customLanguages: [...(settings.customLanguages || []), newLang]
          };
          
          setSettings(updatedSettings);
          await storageService.updateSystemSettings(updatedSettings);
          
          setNewLangName('');
          setNewLangFlag('');
          notify(`Langue ${newLangName} ajoutée !`, 'success');
      } catch (e) {
          notify("Erreur lors de l'ajout.", 'error');
      }
  };

  const removeLanguage = async (code: string) => {
      const updatedSettings = {
          ...settings,
          customLanguages: (settings.customLanguages || []).filter(l => l.code !== code)
      };
      setSettings(updatedSettings);
      await storageService.updateSystemSettings(updatedSettings);
      notify("Langue supprimée.", 'info');
  };

  const handleAddTransactionRef = async () => {
      if (!newTransactionRef.trim()) return;
      
      const updatedSettings = {
          ...settings,
          validTransactionRefs: [...(settings.validTransactionRefs || []), newTransactionRef.trim()]
      };
      setSettings(updatedSettings);
      await storageService.updateSystemSettings(updatedSettings);
      setNewTransactionRef('');
      notify("Référence ajoutée pour auto-validation.", 'success');
  };

  const removeTransactionRef = async (ref: string) => {
      const updatedSettings = {
          ...settings,
          validTransactionRefs: (settings.validTransactionRefs || []).filter(r => r !== ref)
      };
      setSettings(updatedSettings);
      await storageService.updateSystemSettings(updatedSettings);
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()) || (u.email && u.email.toLowerCase().includes(search.toLowerCase())) || (u.phoneNumber && u.phoneNumber.includes(search)));

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 md:p-6 pb-20">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 md:mb-8 bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                    <Key className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                    <h1 className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">ADMINISTRATEUR</h1>
                    <p className="text-xs md:text-sm text-slate-500">Master Control Panel {loading && "(Chargement...)"}</p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <button onClick={refreshData} className="p-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                    <RefreshCw className={`w-5 h-5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={onBack} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 font-bold transition-colors">
                    <MessageCircle className="w-4 h-4" /> Mode Chat
                </button>
                <button onClick={onLogout} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/10 text-red-600 rounded-lg hover:bg-red-100 font-bold transition-colors">
                    <LogOut className="w-4 h-4" /> Déconnexion
                </button>
            </div>
        </div>

        {/* Tabs - Scrollable on mobile */}
        <div className="flex gap-2 md:gap-4 mb-6 overflow-x-auto scrollbar-hide pb-2">
            <button onClick={() => setActiveTab('users')} className={`px-4 py-3 md:px-6 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-900 text-slate-500'}`}>
                <Users className="w-5 h-5" /> Utilisateurs
            </button>
            <button onClick={() => setActiveTab('requests')} className={`px-4 py-3 md:px-6 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === 'requests' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-900 text-slate-500'}`}>
                <MessageSquare className="w-5 h-5" /> Demandes <span className="bg-white/20 px-1.5 rounded-full text-xs">{requests.filter(r => r.status === 'pending').length}</span>
            </button>
            <button onClick={() => setActiveTab('languages')} className={`px-4 py-3 md:px-6 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === 'languages' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-900 text-slate-500'}`}>
                <Globe className="w-5 h-5" /> Langues
            </button>
            <button onClick={() => setActiveTab('settings')} className={`px-4 py-3 md:px-6 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-900 text-slate-500'}`}>
                <Settings className="w-5 h-5" /> Système
            </button>
        </div>

        {/* USERS TAB */}
        {activeTab === 'users' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Rechercher (Nom, Email, Tél)..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="p-4 min-w-[150px]">Utilisateur</th>
                                <th className="p-4 whitespace-nowrap">Crédits</th>
                                <th className="p-4 min-w-[180px]">Gestion (+/-)</th>
                                <th className="p-4 min-w-[200px]">Mot de Passe</th>
                                <th className="p-4">Statut</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                    <td className="p-4">
                                        <div className="font-bold text-slate-800 dark:text-white">{user.username}</div>
                                        <div className="flex flex-col gap-0.5 mt-1">
                                            {user.email && <div className="text-xs text-slate-400 flex items-center gap-1"><MessageSquare className="w-3 h-3"/> {user.email}</div>}
                                            {user.phoneNumber && <div className="text-xs text-slate-400 flex items-center gap-1"><Settings className="w-3 h-3"/> {user.phoneNumber}</div>}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-lg">{user.credits}</span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                placeholder="0"
                                                value={manualCreditInputs[user.id] || ''}
                                                onChange={(e) => handleManualCreditChange(user.id, e.target.value)}
                                                className="w-16 p-2 border border-slate-300 dark:border-slate-600 rounded text-center bg-transparent"
                                            />
                                            <button onClick={() => executeManualCredit(user.id, 1)} className="p-2 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200">
                                                <Plus className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => executeManualCredit(user.id, -1)} className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200">
                                                <Minus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Nouveau MDP"
                                                value={passwordInputs[user.id] || ''}
                                                onChange={(e) => handlePasswordChange(user.id, e.target.value)}
                                                className="w-full min-w-[100px] p-2 border border-slate-300 dark:border-slate-600 rounded bg-transparent"
                                            />
                                            <button onClick={() => saveNewPassword(user)} className="p-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200" disabled={!passwordInputs[user.id]}>
                                                <Save className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {user.isSuspended ? (
                                            <span className="text-red-500 font-bold text-xs flex items-center gap-1"><UserX className="w-3 h-3" /> SUSP.</span>
                                        ) : (
                                            <span className="text-emerald-500 font-bold text-xs flex items-center gap-1"><UserCheck className="w-3 h-3" /> ACTIF</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => toggleSuspend(user)} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${user.isSuspended ? 'border-emerald-500 text-emerald-500 hover:bg-emerald-50' : 'border-red-500 text-red-500 hover:bg-red-50'}`}>
                                            {user.isSuspended ? 'Réactiver' : 'Bloquer'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* REQUESTS TAB */}
        {activeTab === 'requests' && (
             <div className="grid grid-cols-1 gap-4">
                 
                 {/* Auto-Validation Section */}
                 <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800 shadow-sm mb-4">
                     <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 mb-3">
                         <Banknote className="w-4 h-4"/> Auto-Validation Mobile Money
                     </h3>
                     <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                         Collez ici les références ou parties des SMS reçus (ex: "Ref 123456"). Si un utilisateur entre ce code, il sera validé automatiquement.
                     </p>
                     
                     <div className="flex gap-2 mb-3">
                         <input 
                            type="text" 
                            placeholder="Coller référence du SMS..." 
                            value={newTransactionRef}
                            onChange={(e) => setNewTransactionRef(e.target.value)}
                            className="flex-1 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800"
                         />
                         <button onClick={handleAddTransactionRef} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm transition-colors">
                             Ajouter
                         </button>
                     </div>

                     <div className="flex flex-wrap gap-2">
                         {settings.validTransactionRefs?.map((ref, i) => (
                             <div key={i} className="flex items-center gap-1 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/50 shadow-sm">
                                 <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{ref}</span>
                                 <button onClick={() => removeTransactionRef(ref)} className="text-red-400 hover:text-red-600 p-0.5"><X className="w-3 h-3"/></button>
                             </div>
                         ))}
                         {(!settings.validTransactionRefs || settings.validTransactionRefs.length === 0) && (
                             <span className="text-xs text-slate-400 italic">Aucune référence en attente.</span>
                         )}
                     </div>
                 </div>

                 {requests.length === 0 && (
                     <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl text-center text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-800">
                         Aucune demande en attente.
                     </div>
                 )}
                 {requests.map(req => (
                     <div key={req.id} className={`bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl shadow-sm border-l-4 ${req.status === 'pending' ? 'border-amber-500' : req.status === 'approved' ? 'border-emerald-500' : 'border-red-500'} flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}>
                         <div className="w-full md:w-auto">
                             <div className="flex justify-between md:justify-start items-center gap-2 mb-2">
                                 <span className="font-bold text-lg text-slate-800 dark:text-white">{req.username}</span>
                                 <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">{new Date(req.createdAt).toLocaleDateString()}</span>
                             </div>
                             <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                                 {req.type === 'credit' && req.amount && (
                                     <div className="inline-flex items-center gap-1 text-indigo-600 font-bold bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-lg text-sm w-fit">
                                         <CreditCard className="w-4 h-4" /> {req.amount} Crédits
                                     </div>
                                 )}
                                 {req.type === 'password_reset' && (
                                     <div className="inline-flex items-center gap-1 text-red-600 font-bold bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg text-sm w-fit animate-pulse">
                                         <AlertTriangle className="w-4 h-4" /> RESET MDP
                                     </div>
                                 )}
                                 {req.message && (
                                     <div className="text-slate-600 dark:text-slate-300 italic text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                                         "{req.message}"
                                     </div>
                                 )}
                                 {req.contactInfo && (
                                     <div className="text-xs font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/10 px-2 py-1 rounded">
                                         Contact: {req.contactInfo}
                                     </div>
                                 )}
                             </div>
                         </div>
                         <div className="flex items-center gap-2 w-full md:w-auto">
                             {req.status === 'pending' ? (
                                 <div className="flex gap-2 w-full">
                                    <button onClick={() => handleResolveRequest(req.id, 'approved')} className="flex-1 md:flex-none flex items-center justify-center gap-1 px-4 py-3 md:py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors shadow-sm">
                                        <Check className="w-4 h-4" /> {req.type === 'password_reset' ? 'Traité' : 'Approuver'}
                                    </button>
                                    <button onClick={() => handleResolveRequest(req.id, 'rejected')} className="flex-1 md:flex-none flex items-center justify-center gap-1 px-4 py-3 md:py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl font-bold transition-colors">
                                        <X className="w-4 h-4" /> Rejeter
                                    </button>
                                 </div>
                             ) : (
                                 <div className={`w-full md:w-auto text-center font-bold uppercase text-xs px-3 py-1 rounded-full border ${req.status === 'approved' ? 'border-emerald-200 text-emerald-600 bg-emerald-50' : 'border-red-200 text-red-600 bg-red-50'}`}>
                                     {req.status === 'approved' ? 'APPROUVÉ / TRAITÉ' : 'REJETÉ'}
                                 </div>
                             )}
                         </div>
                     </div>
                 ))}
             </div>
        )}

        {/* LANGUAGES TAB */}
        {activeTab === 'languages' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-4 md:p-6 space-y-6">
                <h3 className="text-lg font-bold flex items-center gap-2"><Globe className="w-5 h-5 text-indigo-500" /> Gestion des Langues Supplémentaires</h3>
                
                <div className="flex flex-col md:flex-row gap-2 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nom de la Langue</label>
                        <input 
                            type="text" 
                            value={newLangName}
                            onChange={(e) => setNewLangName(e.target.value)}
                            placeholder="Ex: Portugais"
                            className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div className="w-full md:w-32">
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Drapeau</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={newLangFlag}
                                onChange={(e) => setNewLangFlag(e.target.value)}
                                placeholder="🇵🇹"
                                className="w-full p-3 pl-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            <Flag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                        </div>
                    </div>
                    <button 
                        onClick={handleAddLanguage} 
                        disabled={!newLangName.trim() || !newLangFlag.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 self-end h-[46px]"
                    >
                        Ajouter <Plus className="w-4 h-4"/>
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {settings.customLanguages?.map((lang) => (
                        <div key={lang.code} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
                            <div>
                                <span className="text-2xl mr-2">{lang.flag}</span>
                                <span className="font-bold text-slate-800 dark:text-white">{lang.baseName}</span>
                            </div>
                            <button onClick={() => removeLanguage(lang.code)} className="text-red-500 hover:bg-red-100 p-2 rounded-full transition-colors"><X className="w-4 h-4"/></button>
                        </div>
                    ))}
                    {(!settings.customLanguages || settings.customLanguages.length === 0) && (
                        <div className="col-span-full text-center py-8 text-slate-400 text-sm">Aucune langue personnalisée ajoutée.</div>
                    )}
                </div>
                <button onClick={saveSettings} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg mt-4">
                    <Save className="w-5 h-5" /> Sauvegarder les changements
                </button>
            </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-4 md:p-6 space-y-8">
                {/* Note: API Key management UI removed for GenAI SDK compliance */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                    <h3 className="text-lg font-bold mb-4">Contacts Mobile Money (Affichage User)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Telma</label>
                            <input type="text" value={settings.adminContact.telma} onChange={(e) => setSettings({...settings, adminContact: {...settings.adminContact, telma: e.target.value}})} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-lg mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Airtel</label>
                            <input type="text" value={settings.adminContact.airtel} onChange={(e) => setSettings({...settings, adminContact: {...settings.adminContact, airtel: e.target.value}})} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-lg mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Orange</label>
                            <input type="text" value={settings.adminContact.orange} onChange={(e) => setSettings({...settings, adminContact: {...settings.adminContact, orange: e.target.value}})} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-lg mt-1" />
                        </div>
                    </div>
                </div>

                <button onClick={saveSettings} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg">
                    <Save className="w-5 h-5" /> Enregistrer les paramètres
                </button>
            </div>
        )}

      </div>
    </div>
  );
};

export default AdminDashboard;
