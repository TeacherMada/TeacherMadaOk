
import React, { useEffect, useState } from 'react';
import { ArrowRight, Zap, Sparkles, Layers, Globe, Sun, Moon, CheckCircle2, Play } from 'lucide-react';

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
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-lg border-b border-slate-200 dark:border-white/5 py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={onStart}>
             <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all duration-300">
               <span className="text-xl text-white font-bold">TM</span>
             </div>
             <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">TeacherMada</span>
          </div>
          
          <div className="flex gap-4 items-center">
              <button
                  onClick={toggleTheme}
                  className="p-2.5 rounded-full hover:bg-slate-200/50 dark:hover:bg-white/10 transition-all text-slate-500 dark:text-slate-400"
              >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button 
                  onClick={onStart}
                  className="hidden sm:block px-6 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition-colors"
              >
                  Se connecter
              </button>
              <button 
                  onClick={onStart}
                  className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
              >
                  Commencer
              </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-40 pb-20 lg:pt-52 lg:pb-32 px-6 overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-[100%] blur-[120px] -z-10 animate-pulse-slow"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-500/10 dark:bg-violet-500/10 rounded-full blur-[100px] -z-10"></div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 backdrop-blur-sm mb-8 animate-fade-in-up">
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">La nouvelle ère de l'apprentissage</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-8 tracking-tight leading-[1.1] animate-fade-in-up delay-100">
            Intelligent.<br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 dark:from-indigo-400 dark:via-violet-400 dark:to-indigo-400 bg-300% animate-gradient">
              Puissant. Élégant.
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed font-light animate-fade-in-up delay-200">
            <span className="font-semibold text-slate-900 dark:text-white">TeacherMada</span> réinvente votre façon d'apprendre les langues. Une expérience fluide, rapide et sur-mesure, conçue pour l'excellence.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-5 justify-center items-center animate-fade-in-up delay-300">
               <button 
                  onClick={onStart}
                  className="px-10 py-5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-lg font-bold rounded-2xl shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all transform hover:-translate-y-1 flex items-center gap-3 group"
              >
                  Débuter l'expérience
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                  onClick={onStart}
                  className="px-10 py-5 bg-white dark:bg-[#131825] hover:bg-slate-50 dark:hover:bg-[#1A2030] text-slate-800 dark:text-white text-lg font-bold rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm transition-all flex items-center gap-3"
              >
                  <Play className="w-5 h-5 fill-current" />
                  Démonstration
              </button>
          </div>
        </div>
      </header>

      {/* Philosophy Section */}
      <section className="py-24 bg-white dark:bg-[#0B0F19] relative">
         <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                <ValueProp 
                    icon={<Zap className="w-6 h-6" />}
                    title="Rapidité Fulgurante"
                    desc="Progressez 3x plus vite grâce à une méthode adaptative qui cible précisément vos besoins."
                    delay={0}
                />
                <ValueProp 
                    icon={<Layers className="w-6 h-6" />}
                    title="Design Intelligent"
                    desc="Une interface épurée qui s'efface pour laisser place à l'essentiel : votre apprentissage."
                    delay={100}
                />
                <ValueProp 
                    icon={<Globe className="w-6 h-6" />}
                    title="Immersion Totale"
                    desc="Dialoguez, écoutez et apprenez avec une fluidité naturelle, comme avec un natif."
                    delay={200}
                />
            </div>
         </div>
      </section>

      {/* Feature Showcase (Dark/Glass) */}
      <section className="py-32 relative overflow-hidden">
         <div className="absolute inset-0 bg-slate-100 dark:bg-[#0F1422] skew-y-3 origin-top-left scale-110 -z-10"></div>
         
         <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1 space-y-8">
                <h2 className="text-4xl md:text-5xl font-black leading-tight text-slate-900 dark:text-white">
                    Plus qu'un professeur.<br/>
                    Un <span className="text-indigo-600 dark:text-indigo-400">Mentor Personnel.</span>
                </h2>
                <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                    TeacherMada analyse votre style d'apprentissage en temps réel. Il ajuste le vocabulaire, la grammaire et la complexité de chaque phrase pour vous garder dans la zone de progression optimale.
                </p>
                <ul className="space-y-4 pt-4">
                    <CheckItem text="Correction instantanée et bienveillante" />
                    <CheckItem text="Leçons générées dynamiquement" />
                    <CheckItem text="Synthèse vocale ultra-réaliste" />
                    <CheckItem text="Disponible 24/7, sans jugement" />
                </ul>
            </div>
            
            <div className="flex-1 relative">
                {/* Abstract UI Representation */}
                <div className="relative z-10 bg-white dark:bg-[#1A2030] border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl shadow-indigo-500/20 transform rotate-3 hover:rotate-0 transition-transform duration-500">
                    <div className="flex items-center gap-3 mb-6 border-b border-slate-100 dark:border-white/5 pb-4">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400">TM</div>
                            <div className="flex-1 bg-slate-50 dark:bg-[#0B0F19] p-4 rounded-2xl rounded-tl-none text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                Bonjour ! Aujourd'hui, nous allons perfectionner votre accent. Répétez après moi cette phrase clé.
                            </div>
                        </div>
                        <div className="flex gap-4 flex-row-reverse">
                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">You</div>
                            <div className="flex-1 bg-indigo-600 text-white p-4 rounded-2xl rounded-tr-none text-sm shadow-lg shadow-indigo-600/20">
                                D'accord, je suis prêt ! C'est parti.
                            </div>
                        </div>
                        <div className="h-2 w-1/3 bg-slate-100 dark:bg-white/5 rounded-full animate-pulse"></div>
                    </div>
                </div>
                <div className="absolute top-10 -right-10 w-full h-full border-2 border-dashed border-indigo-300 dark:border-indigo-800/30 rounded-3xl -z-10 rounded-br-[4rem]"></div>
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 dark:border-white/5 bg-white dark:bg-[#0B0F19]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
                <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center shadow-md">
                   <span className="text-white font-bold text-xs">TM</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white tracking-tight">TeacherMada</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-500">
                &copy; {new Date().getFullYear()} TeacherMada. L'excellence pour tous.
            </p>
        </div>
      </footer>
    </div>
  );
};

const ValueProp = ({ icon, title, desc, delay }: { icon: React.ReactNode, title: string, desc: string, delay: number }) => (
    <div 
        className="group p-8 rounded-3xl bg-slate-50 dark:bg-[#131825] hover:bg-white dark:hover:bg-[#1A2030] border border-transparent hover:border-indigo-100 dark:hover:border-indigo-500/20 transition-all duration-300 hover:-translate-y-2 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10"
        style={{ transitionDelay: `${delay}ms` }}
    >
        <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#0B0F19] shadow-sm flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
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
        <span className="font-medium">{text}</span>
    </li>
);

export default LandingPage;
