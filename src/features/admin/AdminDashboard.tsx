import { useAuthStore } from '@/shared/store/store';
import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';
import { Users, Activity, Server, AlertTriangle } from 'lucide-react';

const data = [
    { name: 'Sales', users: 40, requests: 2400 },
    { name: 'HR', users: 30, requests: 1398 },
    { name: 'Legal', users: 20, requests: 9800 },
    { name: 'IT', users: 27, requests: 3908 },
    { name: 'Marketing', users: 18, requests: 4800 },
];

const sessions = [
    { time: '09:00', active: 12 },
    { time: '10:00', active: 45 },
    { time: '11:00', active: 89 },
    { time: '12:00', active: 60 },
    { time: '13:00', active: 75 },
    { time: '14:00', active: 110 },
];

export const AdminDashboard: React.FC = () => {
    return (
        <div className="flex-1 bg-gray-50 dark:bg-zinc-950 p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Administration</h1>
                        <p className="text-sm text-gray-500">Real-time monitoring and governance</p>
                    </div>
                    <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        <span>All Systems Operational</span>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Active Sessions</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">112</p>
                            </div>
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <Activity className="w-5 h-5 text-blue-600" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Total Users</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">1,402</p>
                            </div>
                            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                                <Users className="w-5 h-5 text-purple-600" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">n8n Workers</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">8/8</p>
                            </div>
                            <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                                <Server className="w-5 h-5 text-orange-600" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-500">Flagged Prompts</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">3</p>
                            </div>
                            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Request Volume by Department</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                                    <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
                                    <YAxis stroke="#9CA3AF" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    />
                                    <Bar dataKey="requests" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Real-time Active Sessions</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={sessions}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                                    <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                                    <YAxis stroke="#9CA3AF" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    />
                                    <Line type="monotone" dataKey="active" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* User Table Snippet */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Recent Access Logs</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-800 dark:text-gray-400">
                                <tr>
                                    <th scope="col" className="px-6 py-3">User</th>
                                    <th scope="col" className="px-6 py-3">Action</th>
                                    <th scope="col" className="px-6 py-3">Status</th>
                                    <th scope="col" className="px-6 py-3">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-white dark:bg-zinc-900 border-b dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">Sarah Connor (Sales)</td>
                                    <td className="px-6 py-4">Query ERP Database</td>
                                    <td className="px-6 py-4"><span className="text-green-600">Allowed</span></td>
                                    <td className="px-6 py-4">2 mins ago</td>
                                </tr>
                                <tr className="bg-white dark:bg-zinc-900 border-b dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">John Doe (Intern)</td>
                                    <td className="px-6 py-4">Access HR Salaries</td>
                                    <td className="px-6 py-4"><span className="text-red-600">Blocked (RBAC)</span></td>
                                    <td className="px-6 py-4">5 mins ago</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
};
