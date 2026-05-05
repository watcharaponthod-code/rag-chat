import React, { useState } from 'react';
import { useAuthStore } from '@/shared/store/store';
import { motion, AnimatePresence } from 'framer-motion';

// Typed wrappers to fix Framer Motion + React 19 type mismatches
const MotionDiv = motion.div as any;

export const Auth: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [department, setDepartment] = useState('');
    const [msg, setMsg] = useState('');
    const { login, register, isLoading } = useAuthStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg('');

        try {
            if (isLogin) {
                await login(name, password);
            } else {
                await register(name, password, department);
                setMsg('ทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ');
                setIsLogin(true);
                // Clear sensitive fields
                setPassword('');
            }
        } catch (error) {
            setMsg('เกิดข้อผิดพลาด: ' + (error instanceof Error ? error.message : String(error)));
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent backdrop-blur-sm p-4">
            <MotionDiv
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl backdrop-blur-md"
            >
                <h2 className="text-3xl font-bold text-white mb-6 text-center">
                    {isLogin ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-gray-300 text-sm font-medium mb-1">ชื่อผู้ใช้ (Name)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-black/20 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-gray-500"
                            placeholder="กรอกชื่อของคุณ"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-gray-300 text-sm font-medium mb-1">รหัสผ่าน (Password)</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/20 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-gray-500"
                            placeholder="กรอกรหัสผ่าน"
                            required
                        />
                    </div>

                    <AnimatePresence>
                        {!isLogin && (
                            <MotionDiv
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="pb-4">
                                    <label className="block text-gray-300 text-sm font-medium mb-1">แผนก (Department)</label>
                                    <input
                                        type="text"
                                        value={department}
                                        onChange={(e) => setDepartment(e.target.value)}
                                        className="w-full bg-black/20 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-gray-500"
                                        placeholder="ระบุแผนกของคุณ"
                                        required={!isLogin}
                                    />
                                </div>
                            </MotionDiv>
                        )}
                    </AnimatePresence>

                    {msg && (
                        <div className={`p-3 rounded-lg text-sm ${msg.includes('สำเร็จ') ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                            {msg}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 flex justify-center items-center"
                    >
                        {isLoading ? (
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            isLogin ? 'เข้าสู่ระบบ' : 'ลงทะเบียน'
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-gray-400 text-sm">
                        {isLogin ? 'ยังไม่มีบัญชีใช่ไหม? ' : 'มีบัญชีอยู่แล้ว? '}
                        <button
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setMsg('');
                            }}
                            className="text-blue-400 hover:text-blue-300 hover:underline font-medium ml-1"
                        >
                            {isLogin ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
                        </button>
                    </p>
                </div>
            </MotionDiv>
        </div>
    );
};
