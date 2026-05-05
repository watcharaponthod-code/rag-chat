import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/shared/store/store';
import { Lock, User, Building, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Typed wrappers to fix Framer Motion + React 19 type mismatches
const MotionDiv = motion.div as any;
const MotionButton = motion.button as any;

const ParticleBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        const particles: any[] = [];
        const particleCount = Math.min(Math.floor(window.innerWidth / 15), 100);

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                size: Math.random() * 2 + 1,
                color: Math.random() > 0.9 ? 'rgba(223, 50, 50, 0.8)' : 'rgba(156, 163, 175, 0.6)'
            })
        }

        let animationFrameId: number;

        const render = () => {
            ctx.clearRect(0, 0, w, h);

            particles.forEach((p, index) => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > w) p.vx *= -1;
                if (p.y < 0 || p.y > h) p.vy *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();

                for (let j = index + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 150) {
                        ctx.beginPath();
                        const opacity = 1 - (dist / 150);
                        ctx.strokeStyle = `rgba(156, 163, 175, ${opacity * 0.4})`;
                        ctx.lineWidth = 1;
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        const handleResize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return <canvas ref={canvasRef} className="absolute inset-0 z-0" />;
}

export const Login: React.FC = () => {
    const { login, register, isLoading } = useAuthStore();
    const [isLogin, setIsLogin] = useState(true);

    // Form State
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [department, setDepartment] = useState('');
    const [avatar, setAvatar] = useState<File | null>(null);

    // Feedback
    const [msg, setMsg] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg('');

        if (!name || !password) return;
        if (!isLogin && !department) return;

        // Verify Passwords
        if (!isLogin && password !== confirmPassword) {
            setMsg('รหัสผ่านไม่ตรงกัน กรุณาลองใหม่อีกครั้ง');
            return;
        }

        try {
            if (isLogin) {
                await login(name, password);
            } else {
                await register(name, password, department, avatar);
                setMsg('ทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ');
                setIsLogin(true);
                // Clear sensitive
                setPassword('');
                setConfirmPassword('');
                setAvatar(null);
            }
        } catch (error: any) {
            setMsg(error.message || 'Failed to process request. Please check your inputs.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 px-4 relative overflow-hidden">
            <ParticleBackground />



            {/* Theme Toggle */}
            <div className="absolute top-4 right-4 z-50">
                <button
                    onClick={() => {
                        const isDark = document.documentElement.classList.toggle('dark');
                        localStorage.setItem('theme', isDark ? 'dark' : 'light');
                    }}
                    className="p-2 rounded-full bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors shadow-sm"
                >
                    <span className="dark:hidden"><Sun className="w-5 h-5" /></span>
                    <span className="hidden dark:inline"><Moon className="w-5 h-5" /></span>
                </button>
            </div>

            <MotionDiv
                key={isLogin ? 'login' : 'register'}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-gray-100 dark:border-zinc-800 p-8 relative z-10"
            >
                <div className="text-center mb-8">
                    <div className="flex flex-col items-center justify-center mb-6 select-none">
                        <div className="relative">
                            <h1 className="text-5xl font-black tracking-tighter text-gray-700 dark:text-white flex items-center">
                                SYC
                                <span className="relative mx-0.5">
                                    A
                                    <div className="absolute bottom-[20px] left-[13px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[16px] border-b-[#d32f2f]"></div>
                                </span>
                                PT
                            </h1>
                        </div>
                        <p className="text-[10px] tracking-[0.4em] font-bold text-gray-400 dark:text-gray-500 mt-3 uppercase">
                            Company Limited
                        </p>
                    </div>


                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {isLogin ? 'Enterprise AI Workspace Authentication' : 'Create your secure profile'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* USERNAME */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            User Name
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                className="focus:ring-brand-500 focus:border-brand-500 block w-full pl-10 sm:text-sm border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-md h-10 transition-shadow duration-200"
                                placeholder="Enter your username"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* PASSWORD */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Password
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                type="password"
                                className="focus:ring-brand-500 focus:border-brand-500 block w-full pl-10 sm:text-sm border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-md h-10 transition-shadow duration-200"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* CONFIRM PASSWORD (Register Only) */}
                    <AnimatePresence>
                        {!isLogin && (
                            <MotionDiv
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Confirm Password
                                    </label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <input
                                            type="password"
                                            className="focus:ring-brand-500 focus:border-brand-500 block w-full pl-10 sm:text-sm border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-md h-10 transition-shadow duration-200"
                                            placeholder="Confirm your password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required={!isLogin}
                                        />
                                    </div>
                                </div>
                            </MotionDiv>
                        )}
                    </AnimatePresence>

                    {/* DEPARTMENT & AVATAR (Register Only) */}
                    <AnimatePresence>
                        {!isLogin && (
                            <MotionDiv
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="pb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Department
                                    </label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Building className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <select
                                            value={department}
                                            onChange={(e) => setDepartment(e.target.value)}
                                            className="focus:ring-brand-500 focus:border-brand-500 block w-full pl-10 sm:text-sm border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-md h-10 transition-shadow duration-200 appearance-none"
                                            required={!isLogin}
                                        >
                                            <option value="" disabled>Select Department</option>
                                            <option value="Dev">Dev</option>
                                            <option value="PM">PM</option>
                                            <option value="HR">HR</option>
                                            <option value="QA">QA</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="pb-1 mt-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Profile Picture (Optional)
                                    </label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => setAvatar(e.target.files ? e.target.files[0] : null)}
                                            className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-md file:border-0
                                file:text-sm file:font-semibold
                                file:bg-brand-50 file:text-brand-700
                                hover:file:bg-brand-100
                                dark:file:bg-zinc-800 dark:file:text-brand-400
                            "
                                        />
                                    </div>
                                </div>
                            </MotionDiv>
                        )}
                    </AnimatePresence>

                    {/* MESSAGE */}
                    <AnimatePresence mode='wait'>
                        {msg && (
                            <MotionDiv
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, height: 0 }}
                                className={`p-3 rounded-lg text-sm text-center flex items-center justify-center space-x-2 ${msg.includes('สำเร็จ') ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'}`}
                            >
                                {msg.includes('สำเร็จ') ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                )}
                                <span>{msg}</span>
                            </MotionDiv>
                        )}
                    </AnimatePresence>

                    <div className="space-y-4 pt-2">
                        <MotionButton
                            whileHover={{ scale: 1.03, boxShadow: "0 4px 15px rgba(0,0,0,0.1)" }}
                            whileTap={{ scale: 0.96 }}
                            type="submit"
                            disabled={isLoading}
                            className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold tracking-wide text-white 
                                bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-600
                                focus:outline-none focus:ring-4 focus:ring-brand-500/30 transition-all duration-300 relative overflow-hidden ${isLoading ? 'cursor-not-allowed opacity-80' : ''
                                }`}
                        >
                            {isLoading && (
                                <MotionDiv
                                    className="absolute inset-0 bg-white/20"
                                    initial={{ x: '-100%' }}
                                    animate={{ x: '100%' }}
                                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                />
                            )}
                            {isLoading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Processing...
                                </span>
                            ) : (
                                isLogin ? 'Sign In' : 'Register Member'
                            )}
                        </MotionButton>

                        <MotionButton
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            className="w-full flex justify-center items-center py-2.5 px-4 rounded-xl text-sm font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all duration-200 cursor-pointer"
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setMsg('');
                            }}
                        >
                            {isLogin ? (
                                <span>Don't have an account? <span className="underline decoration-2 underline-offset-2">Sign Up</span></span>
                            ) : (
                                <span>Already have an account? <span className="underline decoration-2 underline-offset-2">Sign In</span></span>
                            )}
                        </MotionButton>
                    </div>
                </form>
            </MotionDiv>
        </div >
    );
};
