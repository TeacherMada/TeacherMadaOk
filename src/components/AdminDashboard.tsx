
import React, { useState, useEffect } from 'react';
import { UserProfile, SystemSettings, AdminRequest } from '../types';
import { storageService } from '../services/storageService';
// Added 'Info' to the imports from lucide-react
import { Users, CreditCard, Settings, Search, Save, Key, UserCheck, UserX, LogOut, ArrowLeft, MessageSquare, Check, X, Plus, Minus, Lock, CheckCircle, RefreshCw, MessageCircle, AlertTriangle, Globe, Banknote, Flag, Info } from 'lucide-react';

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
  
  const [newLangName, setNewLangName] = useState('');
  const [newLangFlag, setNewLangFlag] = useState('');
  const [newTransactionRef, setNewTransactionRef] = useState('');

  const [manualCreditInputs, setManualCreditInputs] = useState<Record<string, string>>({});
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
        notify("Erreur lors du chargement.", 'error');
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
          setManualCreditInputs(prev => ({ ...prev, [userId]: '' })); 
          await refreshData();
          notify(`Crédits modifiés: ${finalAmt}`, 'success');
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
          notify(`Mot de passe mis à jour.`, 'success');
      }
  };

  const toggleSuspend = (user: UserProfile) => {
      const updated = { ...user, isSuspended: !user.isSuspended };
      storageService.saveUserProfile(updated);
      setUsers(prev => prev.map(u => u.id === user.id ? updated : u));
      notify(`Statut utilisateur modifié.`, 'info');
  };

  const handleResolveRequest = async (reqId: string, status: 'approved' | 'rejected') => {
      await storageService.resolveRequest(reqId, status);
      await refreshData();
      notify(`Demande traitée.`, 'success');
  };

  const saveSettings = async () => {
      await storageService.updateSystemSettings(settings);
      notify("Paramètres sauvegardés.", 'success');
  };

  const handleAddLanguage = async () => {
      if (!newLangName.trim() || !newLangFlag.trim()) return;
      const code = `${newLangName} ${newLangFlag}`;
      const newLang = { code, baseName: newLangName, flag: newLangFlag };
      const updatedSettings = { ...settings, customLanguages: [...(settings.customLanguages || []), newLang] };
      setSettings(updatedSettings);
      await storageService.updateSystemSettings(updatedSettings);
      setNewLangName(''); setNewLangFlag('');
      notify(`Langue ajoutée !`, 'success');
  };

  const removeLanguage = async (code: string) => {
      const updatedSettings = { ...settings, customLanguages: (settings.customLanguages || []).filter(l => l.code !== code) };
      setSettings(updatedSettings);
      await storageService.updateSystemSettings(updatedSettings);
  };

  const handleAddTransactionRef = async () => {
      if (!newTransactionRef.trim()) return;
      const updatedSettings = { ...settings, validTransactionRefs: [...(settings.validTransactionRefs || []), newTransactionRef.trim()] };
      setSettings(updatedSettings);
      await storageService.updateSystemSettings(updatedSettings);
      setNewTransactionRef('');
  };

  // Added missing removeTransactionRef function
  const removeTransactionRef = async (refToRemove: string) => {
      const updatedSettings = { ...settings, validTransactionRefs: (settings.validTransactionRefs || []).filter(r => r !== refToRemove) };
      setSettings(updatedSettings);
      await storageService.updateSystemSettings(updatedSettings);
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()) || (u.email && u.email.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 md:p-6 pb-20">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm">
            <div className="flex items-center gap-4">
                <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-500/20">
                    <Shield className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight">TeacherMada Admin</h1>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Master Dashboard</p>
                </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
                <button onClick={onBack} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold transition-all hover:bg-slate-200">
                    Chat Mode
                </button>
                <button onClick={onLogout} className="flex-1 md:flex-none px-6 py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20">
                    Logout
                </button>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-2">
            <Tab active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users className="w-4 h-4"/>} label="Utilisateurs" />
            <Tab active={activeTab === 'requests'} onClick={() => setActiveTab('requests')} icon={<MessageSquare className="w-4 h-4"/>} label="Demandes" count={requests.filter(r => r.status === 'pending').length} />
            <Tab active={activeTab === 'languages'} onClick={() => setActiveTab('languages')} icon={<Globe className="w-4 h-4"/>} label="Langues" />
            <Tab active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings className="w-4 h-4"/>} label="Système" />
        </div>

        {/* Tab Content */}
        {activeTab === 'users' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-800">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase text-slate-400">
                            <tr>
                                <th className="p-4">Utilisateur</th>
                                <th className="p-4">Crédits</th>
                                <th className="p-4">Actions Rapides</th>
                                <th className="p-4">Mot de Passe</th>
                                <th className="p-4 text-right">Statut</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="p-4">
                                        <div className="font-bold">{user.username}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">{user.email || 'Pas d\'email'}</div>
                                    </td>
                                    <td className="p-4 font-black text-indigo-600 text-lg">{user.credits}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-1">
                                            <input type="number" placeholder="0" value={manualCreditInputs[user.id] || ''} onChange={(e) => handleManualCreditChange(user.id, e.target.value)} className="w-16 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-center font-bold" />
                                            <button onClick={() => executeManualCredit(user.id, 1)} className="p-2 bg-emerald-500 text-white rounded-lg"><Plus className="w-4 h-4"/></button>
                                            <button onClick={() => executeManualCredit(user.id, -1)} className="p-2 bg-red-500 text-white rounded-lg"><Minus className="w-4 h-4"/></button>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-1">
                                            <input type="text" placeholder="Nouveau MDP" value={passwordInputs[user.id] || ''} onChange={(e) => handlePasswordChange(user.id, e.target.value)} className="w-32 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
                                            <button onClick={() => saveNewPassword(user)} className="p-2 bg-indigo-600 text-white rounded-lg"><Save className="w-4 h-4"/></button>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => toggleSuspend(user)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${user.isSuspended ? 'border-red-500 text-red-500 bg-red-50 dark:bg-red-900/10' : 'border-emerald-500 text-emerald-500 bg-emerald-50 dark:bg-emerald-900/10'}`}>
                                            {user.isSuspended ? 'Bloqué' : 'Actif'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
            <div className="space-y-4">
                 {/* Auto Validation refs */}
                 <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-900">
                     <h3 className="font-bold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-2"><Banknote className="w-5 h-5"/> Auto-Validation (Refs)</h3>
                     <div className="flex gap-2 mb-4">
                         <input type="text" placeholder="Coller réf SMS..." value={newTransactionRef} onChange={e => setNewTransactionRef(e.target.value)} className="flex-1 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 outline-none bg-white dark:bg-slate-900" />
                         <button onClick={handleAddTransactionRef} className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl">Ajouter</button>
                     </div>
                     <div className="flex flex-wrap gap-2">
                        {settings.validTransactionRefs?.map((ref, i) => (
                            <div key={i} className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg flex items-center gap-2 text-xs font-mono font-bold shadow-sm">
                                {ref} <button onClick={() => removeTransactionRef(ref)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3"/></button>
                            </div>
                        ))}
                     </div>
                 </div>

                 {requests.map(req => (
                     <div key={req.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                         <div>
                             <div className="flex items-center gap-2 mb-1">
                                 <span className="font-black text-lg">{req.username}</span>
                                 <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{new Date(req.createdAt).toLocaleDateString()}</span>
                             </div>
                             <div className="flex items-center gap-4">
                                 <div className="text-indigo-600 font-bold bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 rounded-lg text-xs">{req.amount} CRD</div>
                                 <div className="text-slate-500 italic text-xs">"{req.message}"</div>
                             </div>
                         </div>
                         <div className="flex gap-2">
                            {req.status === 'pending' ? (
                                <>
                                    <button onClick={() => handleResolveRequest(req.id, 'approved')} className="p-3 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20"><Check className="w-5 h-5"/></button>
                                    <button onClick={() => handleResolveRequest(req.id, 'rejected')} className="p-3 bg-red-500 text-white rounded-xl shadow-lg shadow-red-500/20"><X className="w-5 h-5"/></button>
                                </>
                            ) : (
                                <span className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>{req.status}</span>
                            )}
                         </div>
                     </div>
                 ))}
            </div>
        )}

        {/* Languages Tab */}
        {activeTab === 'languages' && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-black mb-6">Gestion des Langues</h3>
                <div className="flex flex-col md:flex-row gap-3 mb-8">
                    <input type="text" placeholder="Nom (ex: Italien)" value={newLangName} onChange={e => setNewLangName(e.target.value)} className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent" />
                    <input type="text" placeholder="Drapeau 🇮🇹" value={newLangFlag} onChange={e => setNewLangFlag(e.target.value)} className="w-32 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-center" />
                    <button onClick={handleAddLanguage} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl">Ajouter</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {settings.customLanguages?.map(lang => (
                        <div key={lang.code} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl flex justify-between items-center border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:scale-[1.02]">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{lang.flag}</span>
                                <span className="font-bold">{lang.baseName}</span>
                            </div>
                            <button onClick={() => removeLanguage(lang.code)} className="text-red-400 hover:text-red-600 transition-colors"><X className="w-5 h-5"/></button>
                        </div>
                    ))}
                </div>
                <button onClick={saveSettings} className="w-full mt-10 py-4 bg-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20">Sauvegarder tout le système</button>
            </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-black mb-6">Configuration Plateforme</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Prix du Crédit (Ar)</label>
                        <input type="number" value={settings.creditPrice} onChange={e => setSettings({...settings, creditPrice: parseInt(e.target.value)})} className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold text-lg" />
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Contact Telma</label>
                        <input type="text" value={settings.adminContact.telma} onChange={e => setSettings({...settings, adminContact: {...settings.adminContact, telma: e.target.value}})} className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold" />
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Contact Airtel</label>
                        <input type="text" value={settings.adminContact.airtel} onChange={e => setSettings({...settings, adminContact: {...settings.adminContact, airtel: e.target.value}})} className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold" />
                    </div>
                </div>
                <button onClick={saveSettings} className="w-full mt-10 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2">
                    <Save className="w-5 h-5"/> Enregistrer les changements système
                </button>
                <div className="mt-8 p-6 bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-400 rounded-r-2xl">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold mb-2"><Info className="w-5 h-5"/> Note sur les clés API</div>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">Les clés API Gemini sont désormais gérées directement via les variables d'environnement sur votre hébergeur (Render). Pour ajouter ou modifier des clés, modifiez la variable <strong>API_KEY</strong> dans votre panneau Render.</p>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

const Tab = ({ active, onClick, icon, label, count }: any) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all ${active ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-100 dark:border-slate-800'}`}>
        {icon} {label} {count !== undefined && count > 0 && <span className="bg-white/20 px-1.5 rounded-full text-[10px] font-black">{count}</span>}
    </button>
);

const Shield = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);

export default AdminDashboard;
