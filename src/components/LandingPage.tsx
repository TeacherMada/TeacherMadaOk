
import React, { useEffect, useState, useMemo } from 'react';
import { ArrowRight, Zap, Sparkles, Layers, Globe, Sun, Moon, CheckCircle2, Play, Facebook, GraduationCap, MessageCircle, Star, Mic, Ear, Rocket, Brain, Target, Users, BookOpen, Shield, FileText, Download, Compass, MessageSquareText, Headphones, Award, Map, PhoneCall, Crown } from 'lucide-react';
import LiveChatDemo from './LiveChatDemo';
import { storageService } from '../services/storageService';
import { TargetLanguage } from '../types';
import LegalModal from './LegalModals';
import { getFlagUrl } from '../constants'; // Import du helper

interface LandingPageProps {
  onStart: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const WORDS = ["GRATUITEMENT", "INTELLIGEMMENT", "RAPIDEMENT", "NATURELLEMENT", "EFFICACEMENT"];

const LandingPage: React.FC<LandingPageProps> = ({ onStart, isDarkMode, toggleTheme }) => {
  const [scrolled, setScrolled] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);
  const [dynamicLanguages, setDynamicLanguages] = useState<any[]>([]);
  const [activeLegal, setActiveLegal] = useState<'privacy' | 'terms' | null>(null);
  
  const [stats, setStats] = useState({ visitors: 14203, students: 850, lessons: 3900 });
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        console.log("PWA Install Prompt captured");
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
        setWordIndex((prev) => (prev + 1) % WORDS.length);
        setFadeKey((prev) => prev + 1);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
      const interval = setInterval(() => {
          setStats(prev => ({ ...prev, visitors: prev.visitors + Math.floor(Math.random() * 2) }));
      }, 4000);

      const loadStats = async () => {
          const users = await storageService.getAllUsers();
          const baseStudents = 850;
          setStats(prev => ({ ...prev, students: baseStudents + users.length }));
      };
      
      const loadLangs = async () => {
          const settings = await storageService.loadSystemSettings();
          const customLangs = settings.customLanguages || [];
          const staticLangs = Object.values(TargetLanguage);
          
          const formattedStatic = staticLangs.map(l => ({
              code: l,
              baseName: (l as string).split(' ')[0],
              flagUrl: getFlagUrl((l as string).split(' ')[0]) // Utilisation du helper
          }));

          setDynamicLanguages([...formattedStatic, ...customLangs.map(c => ({...c, flagUrl: getFlagUrl(c.baseName)}))]);
      };

      loadStats();
      loadLangs();

      return () => clearInterval(interval);
  }, []);

  const handleInstallClick = async () => {
      if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`User response to the install prompt: ${outcome}`);
          setDeferredPrompt(null);
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 transition-colors duration-500 overflow-x-hidden font-sans selection:bg-indigo-500 selection:text-white">
      
      <LegalModal type={activeLegal} onClose={() => setActiveLegal(null)} />

      {/* Navbar */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-lg border-b border-slate-200 dark:border-white/5 py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={onStart}>
             <div className="relative w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl group-hover:scale-105 transition-transform duration-300 overflow-hidden">
                <img 
                    src="https://i.ibb.co/B2XmRwmJ/logo.png" 
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }}
                    alt="TeacherMada Logo" 
                    className="w-full h-full object-contain" 
                />
             </div>
             <div className="flex flex-col">
                 <span className="text-xl md:text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-indigo-700 dark:from-white dark:to-indigo-300 leading-none">TeacherMada</span>
             </div>
          </div>
          
          <div className="flex gap-3 md:gap-4 items-center">
              <button
                  onClick={toggleTheme}
                  className="p-2.5 rounded-full hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all text-slate-500 dark:text-slate-400"
              >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              {deferredPrompt && (
                  <button 
                      onClick={handleInstallClick}
                      className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-full text-xs font-bold transition-colors animate-pulse"
                  >
                     <Download className="w-4 h-4" />
                     Installer
                  </button>
              )}
              <button 
                  onClick={onStart}
                  className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                  Commencer
              </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-32 pb-16 lg:pt-48 lg:pb-24 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-[120px] -z-10 animate-pulse-slow"></div>
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Left Content */}
            <div className="text-center lg:text-left z-10">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 backdrop-blur-sm mb-6 animate-fade-in-up">
                    <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">PÃ©dagogie 2.0</span>
                </div>
                
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-black mb-6 tracking-tight leading-[1.1] animate-fade-in-up delay-100 text-slate-900 dark:text-white">
                    APPRENEZ <br/>
                    <span 
                        key={fadeKey}
                        className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 dark:from-indigo-400 dark:via-purple-400 dark:to-indigo-400 bg-300% animate-gradient inline-block"
                    >
                        {WORDS[wordIndex]}.
                    </span>
                </h1>
                
                <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-medium animate-fade-in-up delay-200">
                    Imaginez-vous parler Chinois, Anglais ou Allemand avec <span className="text-indigo-600 dark:text-indigo-400 font-bold">confiance dÃ¨s le premier jour</span>. <br className="hidden md:block"/> 
                    TeacherMada est votre professeur personnel : disponible 24/7, patient, et incroyablement efficace.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center animate-fade-in-up delay-300">
                    <button 
                        onClick={onStart}
                        className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-lg font-bold rounded-2xl shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3"
                    >
                        CrÃ©er mon compte gratuit
                        <ArrowRight className="w-5 h-5" />
                    </button>
                    
                    {deferredPrompt && (
                      <button 
                          onClick={handleInstallClick}
                          className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-[#131825] hover:bg-slate-50 dark:hover:bg-[#1A2030] text-slate-800 dark:text-white text-lg font-bold rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm transition-all flex items-center justify-center gap-3 animate-bounce-slight"
                      >
                          <Download className="w-5 h-5 text-indigo-500" />
                          Installer l'Application
                      </button>
                    )}
                </div>
            </div>

            {/* Right Content */}
            <div className="relative flex justify-center lg:justify-end animate-fade-in delay-200">
                <div className="relative w-[300px] md:w-[400px] h-[300px] md:h-[400px]">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full opacity-20 blur-3xl animate-blob"></div>
                    <div className="relative z-10 w-full h-full flex items-center justify-center animate-float">
                         <img 
                            src="https://i.ibb.co/B2XmRwmJ/logo.png" 
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }}
                            alt="TeacherMada Mascot" 
                            className="w-full h-full object-contain drop-shadow-2xl scale-[1.4] -translate-y-4" 
                         />
                    </div>
                </div>
            </div>
        </div>
      </header>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-6 mb-16 animate-fade-in delay-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white/50 dark:bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-xl">
              <StatWidget icon={<Globe className="w-6 h-6 text-blue-500" />} value={stats.visitors} label="Visiteurs en direct" live={true} />
              <StatWidget icon={<GraduationCap className="w-6 h-6 text-emerald-500" />} value={stats.students} label="Ã‰tudiants Inscrits" />
              <StatWidget icon={<BookOpen className="w-6 h-6 text-amber-500" />} value={stats.lessons} label="LeÃ§ons Disponibles" />
          </div>
      </section>

      {/* Languages Grid */}
      <section className="py-12 bg-white dark:bg-[#0F1422] border-y border-slate-100 dark:border-slate-800/50">
          <div className="max-w-7xl mx-auto px-6">
              <p className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Choisissez votre langue</p>
              <div className="flex flex-wrap justify-center gap-4 md:gap-8">
                  {dynamicLanguages.slice(0, 8).map((lang, idx) => (
                      <LanguageBadge key={idx} flagUrl={lang.flagUrl} name={lang.baseName} onClick={onStart} />
                  ))}
                  <div onClick={onStart} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer opacity-70 hover:opacity-100">
                      <span className="text-xs font-bold">Et + encore...</span>
                  </div>
              </div>
          </div>
      </section>

      {/* GUIDE PRO REWORKED - ENFANTIN & ELEGANT */}
      <section className="py-24 relative overflow-hidden">
          {/* Fond doux et ludique */}
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/50 to-white dark:from-[#0B0F19] dark:to-[#131825] -z-20"></div>
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-30 dark:opacity-10">
              <div className="absolute top-10 left-10 w-64 h-64 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
              <div className="absolute top-10 right-10 w-64 h-64 bg-yellow-300 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
              <div className="absolute bottom-10 left-1/2 w-64 h-64 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
          </div>

          <div className="max-w-7xl mx-auto px-6 relative z-10">
              <div className="text-center mb-20">
                  <span className="inline-block py-1 px-3 rounded-full bg-white dark:bg-slate-800 border border-indigo-100 dark:border-slate-700 text-indigo-500 font-bold text-xs uppercase tracking-wider mb-4 shadow-sm">
                      âœ¨ Simple comme bonjour
                  </span>
                  <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white mb-6">
                      L'apprentissage <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">Magique</span>.
                  </h2>
                  <p className="text-lg text-slate-600 dark:text-slate-300 max-w-xl mx-auto font-medium">
                      Pas de manuels compliquÃ©s. Juste toi et ton Professeur de poche. Suis ces 4 Ã©tapes simples.
                  </p>
              </div>

              {/* Steps Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
                  {/* Visual Connector Line (Desktop) */}
                  <div className="hidden lg:block absolute top-16 left-[10%] right-[10%] h-1 bg-gradient-to-r from-indigo-200 via-purple-200 to-amber-200 dark:from-slate-700 dark:to-slate-700 rounded-full -z-10 opacity-50"></div>

                  {/* STEP 1 */}
                  <div className="group relative" onClick={onStart}>
                      <div className="absolute inset-0 bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-indigo-500/10 transform transition-transform group-hover:scale-105 group-hover:-rotate-2 border border-slate-100 dark:border-slate-700"></div>
                      <div className="relative p-8 text-center flex flex-col items-center h-full">
                          <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black text-xl mb-6 shadow-lg ring-4 ring-indigo-100 dark:ring-indigo-900/50 z-10">1</div>
                          <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl">
                              <Map className="w-10 h-10 text-indigo-500" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Choisis ta destination</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                              Dis Ã  TeacherMada quelle langue tu veux explorer. Il s'adapte Ã  ton niveau.
                          </p>
                      </div>
                  </div>

                  {/* STEP 2 */}
                  <div className="group relative" onClick={onStart}>
                      <div className="absolute inset-0 bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-purple-500/10 transform transition-transform group-hover:scale-105 group-hover:rotate-2 border border-slate-100 dark:border-slate-700"></div>
                      <div className="relative p-8 text-center flex flex-col items-center h-full">
                          <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center font-black text-xl mb-6 shadow-lg ring-4 ring-purple-100 dark:ring-purple-900/50 z-10">2</div>
                          <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/30 rounded-2xl">
                              <MessageCircle className="w-10 h-10 text-purple-500" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Parle avec le Prof</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                              Ã‰cris ou parle. Le professeur t'explique tout et corrige tes phrases gentiment.
                          </p>
                      </div>
                  </div>

                  {/* STEP 3 */}
                  <div className="group relative" onClick={onStart}>
                      <div className="absolute inset-0 bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-pink-500/10 transform transition-transform group-hover:scale-105 group-hover:-rotate-1 border border-slate-100 dark:border-slate-700"></div>
                      <div className="relative p-8 text-center flex flex-col items-center h-full">
                          <div className="w-12 h-12 bg-pink-600 text-white rounded-full flex items-center justify-center font-black text-xl mb-6 shadow-lg ring-4 ring-pink-100 dark:ring-pink-900/50 z-10">3</div>
                          <div className="mb-6 p-4 bg-pink-50 dark:bg-pink-900/30 rounded-2xl">
                              <PhoneCall className="w-10 h-10 text-pink-500" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">TÃ©lÃ©phone-lui !</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                              Passe un vrai appel vocal. C'est comme avoir un ami natif au bout du fil.
                          </p>
                      </div>
                  </div>

                  {/* STEP 4 */}
                  <div className="group relative" onClick={onStart}>
                      <div className="absolute inset-0 bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl shadow-amber-500/10 transform transition-transform group-hover:scale-105 group-hover:rotate-1 border border-slate-100 dark:border-slate-700"></div>
                      <div className="relative p-8 text-center flex flex-col items-center h-full">
                          <div className="w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center font-black text-xl mb-6 shadow-lg ring-4 ring-amber-100 dark:ring-amber-900/50 z-10">4</div>
                          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/30 rounded-2xl">
                              <Crown className="w-10 h-10 text-amber-500" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Gagne des TrophÃ©es</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                              Chaque leÃ§on te donne des points. Deviens un expert et remplis ta vitrine !
                          </p>
                      </div>
                  </div>
              </div>

              <div className="mt-20 text-center">
                  <button 
                    onClick={onStart} 
                    className="group relative inline-flex items-center gap-3 px-10 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full font-black text-lg shadow-2xl hover:scale-105 transition-all duration-300 hover:shadow-indigo-500/25"
                  >
                      <Rocket className="w-6 h-6 group-hover:animate-bounce" />
                      <span>Commencer l'Aventure</span>
                  </button>
                  <p className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Gratuit â€¢ Sans Engagement â€¢ Amusant
                  </p>
              </div>
          </div>
      </section>

      {/* Philosophy Section */}
      <section className="py-24 bg-slate-50 dark:bg-[#0B0F19] relative">
         <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-black mb-4 text-slate-900 dark:text-white">Pourquoi Ã§a <span className="text-indigo-600 dark:text-indigo-400">Marche ?</span></h2>
                <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">Une approche scientifique et interactive pour des rÃ©sultats concrets.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <ValueProp icon={<Brain className="w-6 h-6" />} title="Immersion Active" desc="Ne lisez pas seulement. Parlez. Notre technologie vous Ã©coute et vous corrige dÃ¨s la premiÃ¨re seconde pour ancrer les mots." delay={0} />
                <ValueProp icon={<Target className="w-6 h-6" />} title="Hyper-Personnalisation" desc="Votre cours s'adapte Ã  vous. DÃ©butant ou avancÃ©, le contenu Ã©volue en temps rÃ©el selon vos intÃ©rÃªts et votre vitesse." delay={100} />
                <ValueProp icon={<Rocket className="w-6 h-6" />} title="Confiance Totale" desc="Brisez la barriÃ¨re de la langue. EntraÃ®nez-vous avec des scÃ©narios de la vie rÃ©elle sans peur du jugement." delay={200} />
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 dark:border-white/5 bg-white dark:bg-[#0B0F19]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                   <img src="https://i.ibb.co/B2XmRwmJ/logo.png" alt="TeacherMada" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-slate-900 dark:text-white tracking-tight leading-none">TeacherMada</span>
                </div>
            </div>
            <div className="flex gap-6 items-center">
                <button onClick={() => setActiveLegal('terms')} className="text-slate-500 hover:text-indigo-600 transition-colors text-sm font-bold">Conditions</button>
                <button onClick={() => setActiveLegal('privacy')} className="text-slate-500 hover:text-indigo-600 transition-colors text-sm font-bold">ConfidentialitÃ©</button>
                <a href="https://www.facebook.com/TeacherMadaFormation" target="_blank" className="text-slate-500 hover:text-blue-600 transition-colors">
                    <Facebook className="w-5 h-5" />
                </a>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-500">
                &copy; {new Date().getFullYear()} TeacherMada.
            </p>
        </div>
      </footer>
    </div>
  );
};

// --- Sub-components for UI ---

const StatWidget = ({ icon, value, label, live }: { icon: React.ReactNode, value: number, label: string, live?: boolean }) => {
    const [displayValue, setDisplayValue] = useState(0);
    useEffect(() => {
        let start = 0; const duration = 1500; const increment = Math.ceil(value / (duration / 16));
        const timer = setInterval(() => {
            start += increment;
            if (start >= value) { setDisplayValue(value); clearInterval(timer); } 
            else { setDisplayValue(start); }
        }, 16);
        return () => clearInterval(timer);
    }, [value]);
    const formatted = displayValue.toLocaleString('fr-FR');
    return (
        <div className="flex items-center gap-4 group">
            <div className="p-3 bg-white dark:bg-slate-700/50 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-600 group-hover:scale-110 transition-transform duration-300">{icon}</div>
            <div>
                <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">{formatted}</span>
                    {live && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>}
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">{label}</p>
            </div>
        </div>
    );
};

const LanguageBadge: React.FC<{ flagUrl: string, name: string, onClick?: () => void }> = ({ flagUrl, name, onClick }) => (
    <div onClick={onClick} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm hover:scale-105 transition-transform cursor-pointer hover:bg-white dark:hover:bg-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800">
        <img src={flagUrl} alt={name} className="w-5 h-auto rounded-sm shadow-sm" />
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{name}</span>
    </div>
);

// GuideStep supprimÃ© car remplacÃ© par le code inline dans le composant principal pour plus de flexibilitÃ© de design (Cards group hover etc.)

const ValueProp = ({ icon, title, desc, delay }: { icon: React.ReactNode, title: string, desc: string, delay: number }) => (
    <div className="group p-8 rounded-3xl bg-white dark:bg-[#131825] border border-slate-100 dark:border-white/5 hover:border-indigo-100 dark:hover:border-indigo-500/20 transition-all duration-300 hover:-translate-y-2 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10" style={{ transitionDelay: `${delay}ms` }}>
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-[#0B0F19] shadow-inner flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">{icon}</div>
        <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{title}</h3>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm md:text-base">{desc}</p>
    </div>
);

export default LandingPage;
