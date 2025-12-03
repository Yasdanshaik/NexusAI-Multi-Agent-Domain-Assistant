
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { ChartDataPoints, UserContext } from '../types';
import { UserCircleIcon, HeartIcon, AcademicCapIcon, GlobeAmericasIcon } from '@heroicons/react/24/solid';

interface DashboardProps {
  currentInsight?: string | null;
  data?: ChartDataPoints | null;
  userContext?: UserContext | null;
}

// Default/Baseline Data
const DEFAULT_HEALTH = [
  { time: '08:00', heartRate: 72, stress: 20 },
  { time: '10:00', heartRate: 85, stress: 45 },
  { time: '12:00', heartRate: 78, stress: 30 },
  { time: '14:00', heartRate: 90, stress: 60 },
  { time: '16:00', heartRate: 75, stress: 25 },
  { time: '18:00', heartRate: 70, stress: 15 },
];

const DEFAULT_ENV = [
  { day: 'Mon', aqi: 45, pollen: 20 },
  { day: 'Tue', aqi: 55, pollen: 30 },
  { day: 'Wed', aqi: 120, pollen: 80 },
  { day: 'Thu', aqi: 80, pollen: 50 },
  { day: 'Fri', aqi: 40, pollen: 15 },
];

const DEFAULT_EDU = [
  { subject: 'Math', progress: 85, focus: 90 },
  { subject: 'Science', progress: 70, focus: 65 },
  { subject: 'History', progress: 95, focus: 88 },
  { subject: 'Lit', progress: 60, focus: 50 },
];

const Dashboard: React.FC<DashboardProps> = ({ currentInsight, data, userContext }) => {
  const healthData = data?.health && data.health.length > 0 ? data.health : DEFAULT_HEALTH;
  const envData = data?.env && data.env.length > 0 ? data.env : DEFAULT_ENV;
  const eduData = data?.edu && data.edu.length > 0 ? data.edu : DEFAULT_EDU;

  return (
    <div className="flex flex-col gap-6 p-4 h-full overflow-y-auto custom-scrollbar">
      
      {/* Memory Bank Panel */}
      {userContext && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
           <h2 className="text-xl font-bold mb-4 flex items-center text-slate-800">
              <UserCircleIcon className="w-6 h-6 text-nexus mr-2" />
              Memory Bank Profile
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-red-50 rounded-lg border border-red-100">
                 <h4 className="flex items-center text-red-600 font-semibold mb-2"><HeartIcon className="w-4 h-4 mr-2" /> Health</h4>
                 <ul className="text-sm text-slate-600 list-disc ml-4 space-y-1">
                    {userContext.healthConditions.length > 0 ? userContext.healthConditions.map((c, i) => <li key={i}>{c}</li>) : <li className="italic text-slate-400">No data collected</li>}
                 </ul>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                 <h4 className="flex items-center text-blue-600 font-semibold mb-2"><AcademicCapIcon className="w-4 h-4 mr-2" /> Learning Goals</h4>
                 <ul className="text-sm text-slate-600 list-disc ml-4 space-y-1">
                    {userContext.learningGoals.length > 0 ? userContext.learningGoals.map((c, i) => <li key={i}>{c}</li>) : <li className="italic text-slate-400">No data collected</li>}
                 </ul>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                 <h4 className="flex items-center text-green-600 font-semibold mb-2"><GlobeAmericasIcon className="w-4 h-4 mr-2" /> Environment</h4>
                 <ul className="text-sm text-slate-600 list-disc ml-4 space-y-1">
                    {userContext.ecoPreferences.length > 0 ? userContext.ecoPreferences.map((c, i) => <li key={i}>{c}</li>) : <li className="italic text-slate-400">No data collected</li>}
                 </ul>
              </div>
           </div>
           {userContext.notes.length > 0 && (
             <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-100">
               <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Notes: </span>
               <span className="text-sm text-slate-700 italic">{userContext.notes.join('; ')}</span>
             </div>
           )}
        </div>
      )}

      {/* Cross-Domain Insight Panel */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 shadow-lg text-white">
        <h2 className="text-xl font-bold mb-2 flex items-center">
          <span className="bg-nexus w-3 h-3 rounded-full mr-2 animate-pulse"></span>
          Real-Time Data Fusion
        </h2>
        <p className="text-slate-300 text-sm mb-4 min-h-[40px] italic">
          {currentInsight || "Correlating environmental factors with physiological stress levels to optimize learning windows. Ask the assistant to analyze trends to see live updates."}
        </p>
        <div className="h-64 w-full">
           <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={healthData}>
              <defs>
                <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="time" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} 
              />
              <Legend />
              <Area type="monotone" dataKey="heartRate" stroke="#f43f5e" fillOpacity={1} fill="url(#colorHr)" name="Heart Rate (BPM)" />
              <Area type="monotone" dataKey="stress" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorStress)" name="Stress Index" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Environment Card */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <span className="text-eco mr-2">●</span> Environmental Monitoring
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={envData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="aqi" stroke="#10b981" strokeWidth={2} name="AQI" />
                <Line type="monotone" dataKey="pollen" stroke="#f59e0b" strokeWidth={2} name="Pollen" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Education Card */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <span className="text-edu mr-2">●</span> Learning Progress
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={eduData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="progress" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Completion %" />
                <Bar dataKey="focus" fill="#6366f1" radius={[4, 4, 0, 0]} name="Focus Score" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
