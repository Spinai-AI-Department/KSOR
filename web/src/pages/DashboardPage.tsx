import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card } from "@/components/ui/card";
import { dashboardService, type DashboardData } from '../api/dashboard';
import { useAuth } from '../context/AuthContext';

const PIE_COLORS = ['#2563eb', '#60a5fa', '#93c5fd', '#dbeafe', '#1d4ed8'];

const EMPTY_DATA: DashboardData = {
  stats: { total_surgeries: 0, monthly_surgeries: 0, prom_pending_cases: 0, avg_op_time_min: 0, complications_count: 0 },
  vas_odi_trend: [],
  surgery_type_distribution: [],
};

export function Dashboard() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    dashboardService.getData(token)
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : '대시보드 데이터를 불러오는데 실패했습니다.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const { stats, vas_odi_trend, surgery_type_distribution } = data;

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl mb-2">KOMISS / KSOR</h1>
        <p className="text-gray-600">개인 성과 분석 대시보드</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 md:mb-8">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-6 bg-white flex items-center justify-center min-h-[88px]">
              <div className="h-8 w-8 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
            </Card>
          ))
        ) : (
          <>
            <Card className="p-6 bg-white">
              <div className="text-sm text-gray-600 mb-2">총 수술 건수</div>
              <div className="text-2xl md:text-4xl">{stats.total_surgeries}</div>
            </Card>
            <Card className="p-6 bg-white">
              <div className="text-sm text-gray-600 mb-2">이번 달 수술</div>
              <div className="text-2xl md:text-4xl">{stats.monthly_surgeries}</div>
            </Card>
            <Card className="p-6 bg-white">
              <div className="text-sm text-gray-600 mb-2">PROM 대기 건수</div>
              <div className="text-2xl md:text-4xl">{`${stats.prom_pending_cases} 건`}</div>
            </Card>
            <Card className="p-6 bg-white">
              <div className="text-sm text-gray-600 mb-2">합병증 건수</div>
              <div className="text-2xl md:text-4xl">{`${stats.complications_count} 건`}</div>
            </Card>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 md:mb-8">
        {/* VAS & ODI Chart */}
        <Card className="p-6 bg-white relative min-h-[320px]">
          <h3 className="text-lg mb-4">환자 회복 추이 (VAS & ODI)</h3>
          {loading ? (
            <div className="flex items-center justify-center h-[250px]">
              <div className="h-10 w-10 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded"></div>
                    <span>허리 통증(VAS)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded"></div>
                    <span>다리 통증(VAS)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-300 rounded"></div>
                    <span>기능 장애(ODI)</span>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={vas_odi_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="timepoint" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="vas_back" name="허리통증" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="vas_leg"  name="다리통증" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="odi"      name="기능장애" stroke="#93c5fd" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </Card>

        {/* Surgery Type Distribution */}
        <Card className="p-6 bg-white relative min-h-[320px]">
          <h3 className="text-lg mb-4">수술 접근법 비율</h3>
          {loading ? (
            <div className="flex items-center justify-center h-[250px]">
              <div className="h-10 w-10 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={surgery_type_distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="label"
                  >
                    {surgery_type_distribution.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-around mt-4 text-sm gap-2">
                {surgery_type_distribution.map((entry, index) => (
                  <div key={entry.label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}></div>
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

    </div>
  );
}
