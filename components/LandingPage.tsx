
import React, { useEffect, useState } from 'react';
import { ArrowRight, Zap, Sparkles, Layers, Globe, Sun, Moon, CheckCircle2, Play, Facebook, GraduationCap, MessageCircle, Star } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, isDarkMode, toggleTheme }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 transition-colors duration-500 overflow-x-hidden font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* Navbar */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-lg border-b border-slate-200 dark:border-white/5 py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={onStart}>
             {/* Logo TeacherMada */}
             <div className="relative w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl group-hover:scale-105 transition-transform duration-300 overflow-hidden">
                <img src="/logo.png" alt="TeacherMada Logo" className="w-full h-full object-contain" />
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
              <a 
                 href="https://www.facebook.com/TeacherMadaFormation" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold transition-colors"
              >
                 <Facebook className="w-4 h-4 fill-current" />
                 Suivre
              </a>
              <button 
                  onClick={onStart}
                  className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                  Commencer
              </button>
          </div>
        </div>
      </nav>

      {/* Hero Section with Robot Mascot */}
      <header className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-6 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-[120px] -z-10 animate-pulse-slow"></div>
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Left Content */}
            <div className="text-center lg:text-left z-10">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 backdrop-blur-sm mb-6 animate-fade-in-up">
                    <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Pédagogie 2.0</span>
                </div>
                
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-black mb-6 tracking-tight leading-[1.1] animate-fade-in-up delay-100 text-slate-900 dark:text-white">
                    Apprenez <br/>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 dark:from-indigo-400 dark:via-purple-400 dark:to-indigo-400 bg-300% animate-gradient">
                    Intelligemment.
                    </span>
                </h1>
                
                <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-medium animate-fade-in-up delay-200">
                    TeacherMada est votre professeur personnel. Disponible 24/7 pour vous apprendre l'Anglais, le Français, le Chinois et plus encore, avec une méthode structurée et efficace.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center animate-fade-in-up delay-300">
                    <button 
                        onClick={onStart}
                        className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-lg font-bold rounded-2xl shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3"
                    >
                        Créer mon compte
                        <ArrowRight className="w-5 h-5" />
                    </button>
                    <a 
                        href="https://www.facebook.com/TeacherMadaFormation" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-[#131825] hover:bg-slate-50 dark:hover:bg-[#1A2030] text-slate-800 dark:text-white text-lg font-bold rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm transition-all flex items-center justify-center gap-3"
                    >
                        <Facebook className="w-5 h-5 text-blue-600" />
                        Communauté
                    </a>
                </div>
            </div>

            {/* Right Content - Robot & UI */}
            <div className="relative flex justify-center lg:justify-end animate-fade-in delay-200">
                <div className="relative w-[300px] md:w-[400px] h-[300px] md:h-[400px]">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full opacity-20 blur-3xl animate-blob"></div>
                    
                    {/* Robot Image */}
                    <div className="relative z-10 w-full h-full flex items-center justify-center animate-float">
                         <img src="/logo.png" alt="TeacherMada Mascot" className="w-full h-full object-contain drop-shadow-2xl" />
                         
                         {/* Chat Bubble 1 */}
                         <div className="absolute -top-6 -right-12 bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none shadow-xl border border-slate-100 dark:border-slate-700 animate-bounce-slight">
                             <span className="text-2xl">👋</span>
                         </div>
                         {/* Chat Bubble 2 */}
                         <div className="absolute bottom-10 -left-16 bg-indigo-600 text-white p-4 rounded-2xl rounded-tr-none shadow-xl shadow-indigo-500/30 flex items-center gap-2 animate-bounce-slight delay-500">
                             <MessageCircle className="w-5 h-5" />
                             <span className="font-bold text-sm">Prêt à apprendre ?</span>
                         </div>
                    </div>
                </div>
            </div>
        </div>
      </header>

      {/* Languages Grid */}
      <section className="py-12 bg-white dark:bg-[#0F1422] border-y border-slate-100 dark:border-slate-800/50">
          <div className="max-w-7xl mx-auto px-6">
              <p className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Langues Disponibles</p>
              <div className="flex flex-wrap justify-center gap-4 md:gap-8 opacity-80">
                  <LanguageBadge flag="🇫🇷" name="Français" />
                  <LanguageBadge flag="🇬🇧" name="Anglais" />
                  <LanguageBadge flag="🇨🇳" name="Mandarin" />
                  <LanguageBadge flag="🇪🇸" name="Espagnol" />
                  <LanguageBadge flag="🇩🇪" name="Allemand" />
              </div>
          </div>
      </section>

      {/* Philosophy Section */}
      <section className="py-24 bg-slate-50 dark:bg-[#0B0F19] relative">
         <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-black mb-4 text-slate-900 dark:text-white">Une méthode <span className="text-indigo-600 dark:text-indigo-400">Prouvée.</span></h2>
                <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">Plus de listes de vocabulaire ennuyeuses. TeacherMada utilise une structure logique pour ancrer les connaissances durablement.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <ValueProp 
                    icon={<Zap className="w-6 h-6" />}
                    title="Structure Claire"
                    desc="Chaque leçon suit un plan précis : Objectif, Concept, Vocabulaire, Grammaire et Pratique."
                    delay={0}
                />
                <ValueProp 
                    icon={<Layers className="w-6 h-6" />}
                    title="Adaptation Niveau"
                    desc="Que vous soyez débutant A1 ou avancé C1, le professeur ajuste son langage et ses exercices."
                    delay={100}
                />
                <ValueProp 
                    icon={<Globe className="w-6 h-6" />}
                    title="Contexte Culturel"
                    desc="Apprenez non seulement la langue, mais aussi les codes culturels pour voyager sereinement."
                    delay={200}
                />
            </div>
         </div>
      </section>

      {/* Lesson Showcase - Visual Representation */}
      <section className="py-24 relative overflow-hidden bg-slate-100 dark:bg-[#131825]">
         <div className="absolute inset-0 bg-grid-slate-200 dark:bg-grid-slate-800/[0.2] bg-[bottom_1px_center] [mask-image:linear-gradient(to_bottom,transparent,black)]"></div>
         
         <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="flex flex-col lg:flex-row items-center gap-16">
                <div className="flex-1 space-y-8">
                    <h2 className="text-4xl md:text-5xl font-black leading-tight text-slate-900 dark:text-white">
                        Des leçons claires.<br/>
                        <span className="text-indigo-600 dark:text-indigo-400">Visuelles & Efficaces.</span>
                    </h2>
                    <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                        Regardez comment TeacherMada structure l'information. Tout est fait pour faciliter la mémorisation visuelle et auditive.
                    </p>
                    <ul className="space-y-4 pt-4">
                        <CheckItem text="Titre clair et Objectif précis" />
                        <CheckItem text="Vocabulaire avec Audio intégré" />
                        <CheckItem text="Mise en situation pratique immédiate" />
                        <CheckItem text="Export en image pour réviser hors-ligne" />
                    </ul>
                    <button onClick={onStart} className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:scale-105 transition-transform shadow-lg">
                        Essayer une leçon
                    </button>
                </div>
                
                {/* Visual Cards representing the lessons */}
                <div className="flex-1 relative w-full flex justify-center perspective-1000">
                    <div className="relative transform rotate-y-12 rotate-z-2 hover:rotate-0 transition-all duration-700 cursor-pointer group">
                        {/* Fake Lesson Card UI */}
                        <div className="w-[320px] md:w-[380px] bg-slate-900 text-white rounded-3xl p-6 shadow-2xl border border-slate-700 relative overflow-hidden">
                            {/* Decorative Header */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-emerald-600"></div>
                            
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <h3 className="font-bold text-lg text-indigo-300">LEÇON 2 : Se Présenter</h3>
                            </div>

                            {/* Section 1 */}
                            <div className="mb-4 space-y-2">
                                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                                    <TargetIcon className="w-4 h-4" /> Tanjona (Objectif)
                                </div>
                                <p className="text-slate-300 text-xs leading-relaxed">
                                    Apprendre à dire son nom et son origine en Mandarin de façon simple.
                                </p>
                            </div>

                            {/* Section 2 */}
                            <div className="mb-4 p-3 bg-slate-800 rounded-xl border border-slate-700">
                                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm mb-2">
                                    <Layers className="w-4 h-4" /> Vocabulaire
                                </div>
                                <div className="space-y-2">
                                    <VocabItem word="我 (wǒ)" trans="Izaho" />
                                    <VocabItem word="叫 (jiào)" trans="S'appeler" />
                                    <VocabItem word="名字 (míngzi)" trans="Anarana" />
                                </div>
                            </div>

                             {/* Section 3 */}
                            <div className="p-3 bg-indigo-900/30 rounded-xl border border-indigo-500/30">
                                <div className="flex items-center gap-2 text-yellow-400 font-bold text-sm mb-1">
                                    <Star className="w-4 h-4" /> Pratique
                                </div>
                                <p className="text-xs text-indigo-200">Comment diriez-vous "Je m'appelle Alex" ?</p>
                            </div>
                        </div>

                        {/* Floating Badge */}
                        <div className="absolute -top-6 -right-6 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xl flex flex-col items-center gap-1 animate-bounce-slight">
                            <span className="text-2xl font-black text-indigo-600">A1</span>
                            <span className="text-[10px] font-bold uppercase text-slate-500">Niveau</span>
                        </div>
                    </div>
                </div>
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 dark:border-white/5 bg-white dark:bg-[#0B0F19]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                   <img src="/logo.png" alt="TeacherMada" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-slate-900 dark:text-white tracking-tight leading-none">TeacherMada</span>
                </div>
            </div>
            
            <div className="flex gap-6">
                <a href="https://www.facebook.com/TeacherMadaFormation" target="_blank" className="text-slate-500 hover:text-blue-600 transition-colors">
                    <Facebook className="w-5 h-5" />
                </a>
                <a href="#" className="text-slate-500 hover:text-indigo-600 transition-colors text-sm font-bold">Contact</a>
                <a href="#" className="text-slate-500 hover:text-indigo-600 transition-colors text-sm font-bold">À propos</a>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-500">
                &copy; {new Date().getFullYear()} TeacherMada. Tous droits réservés.
            </p>
        </div>
      </footer>
    </div>
  );
};

// Sub-components for UI
const LanguageBadge = ({ flag, name }: { flag: string, name: string }) => (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm hover:scale-105 transition-transform cursor-default">
        <span className="text-lg">{flag}</span>
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{name}</span>
    </div>
);

const TargetIcon = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
);

const VocabItem = ({ word, trans }: { word: string, trans: string }) => (
    <div className="flex items-center justify-between text-xs border-b border-slate-700/50 pb-1 last:border-0 last:pb-0">
        <span className="text-indigo-300 font-mono">{word}</span>
        <span className="text-slate-400 italic">{trans}</span>
    </div>
);

const ValueProp = ({ icon, title, desc, delay }: { icon: React.ReactNode, title: string, desc: string, delay: number }) => (
    <div 
        className="group p-8 rounded-3xl bg-white dark:bg-[#131825] border border-slate-100 dark:border-white/5 hover:border-indigo-100 dark:hover:border-indigo-500/20 transition-all duration-300 hover:-translate-y-2 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10"
        style={{ transitionDelay: `${delay}ms` }}
    >
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-[#0B0F19] shadow-inner flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
            {icon}
        </div>
        <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{title}</h3>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm md:text-base">{desc}</p>
    </div>
);

const CheckItem = ({ text }: { text: string }) => (
    <li className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
        <div className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
        </div>
        <span className="font-medium text-sm md:text-base">{text}</span>
    </li>
);

export default LandingPage;
