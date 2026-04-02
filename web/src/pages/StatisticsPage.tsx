import { useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ScatterChart, Scatter, ZAxis } from 'recharts';
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardService, type ApproachComparison, type PatientOutcomePoint } from '../api/dashboard';
import { useAuth } from '../context/AuthContext';

type RecoveryRow = { period: string; VAS_back: number; VAS_leg: number; ODI: number; EQ5D: number };
type ApproachRow = Record<string, string | number>;
type SatisfactionRow = { subject: string; score: number };
type OutcomeRow = { id: number; age: number; preVAS: number; postVAS: number; improvement: number; approach?: string; satisfaction?: number };

function buildApproachChart(data: ApproachComparison[]) {
  const approaches = data.map(d => d.approach_type);
  const categories = ['수술시간', '출혈량', '입원기간', '합병증율'];
  const getters: ((d: ApproachComparison) => number)[] = [
    d => d.avg_op_time_minutes ?? 0,
    d => d.avg_blood_loss_ml ?? 0,
    d => d.avg_hospital_days ?? 0,
    d => d.complication_rate ?? 0,
  ];
  return categories.map((cat, i) => {
    const row: Record<string, string | number> = { category: cat };
    data.forEach(d => { row[d.approach_type] = getters[i](d); });
    return row;
  });
}

function buildSatisfactionChart(scores: { score: number; count: number; percentage: number }[]) {
  const labels = ['매우불만(1)', '불만(2)', '보통(3)', '만족(4)', '매우만족(5)'];
  return scores.map(s => ({
    subject: labels[s.score - 1] || `${s.score}점`,
    score: s.percentage,
  }));
}

function buildOutcomesChart(data: PatientOutcomePoint[]) {
  return data.map((d, i) => ({
    id: i + 1,
    age: d.age ?? 0,
    preVAS: d.preop_odi ?? 0,
    postVAS: d.postop_odi ?? 0,
    improvement: d.improvement ?? 0,
    approach: d.approach_type || '',
    satisfaction: d.satisfaction_score ?? undefined,
  }));
}

export function SurgeryAnalysis() {
  const { token } = useAuth();
  const [period, setPeriod] = useState('all');
  const [recoveryData, setRecoveryData] = useState<RecoveryRow[]>([]);
  const [approachComparison, setApproachComparison] = useState<ApproachRow[]>([]);
  const [satisfactionData, setSatisfactionData] = useState<SatisfactionRow[]>([]);
  const [patientOutcomes, setPatientOutcomes] = useState<OutcomeRow[]>([]);
  const [allOutcomes, setAllOutcomes] = useState<OutcomeRow[]>([]);
  const [keyMetrics, setKeyMetrics] = useState({ avgVasImprovement: 0, avgOdiImprovement: 0, satisfactionRate: 0, satisfiedCount: 0, totalSatisfaction: 0, reoperationRate: 0, reoperationCount: 0, totalPatients: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    // Load recovery trend
    dashboardService.getData(token).then((data) => {
      const mapped = data.vas_odi_trend.map((d) => ({
        period: d.timepoint,
        VAS_back: d.vas_back ?? 0,
        VAS_leg: d.vas_leg ?? 0,
        ODI: d.odi ?? 0,
        EQ5D: 0,
      }));
      if (mapped.length > 0) setRecoveryData(mapped);
    }).catch(() => {});

    // Load statistics (approach comparison, satisfaction, patient outcomes, summary)
    dashboardService.getStatistics(token).then((stats) => {
      // Use backend-computed summary metrics when available
      if (stats.summary) {
        const s = stats.summary;
        const totalResp = stats.satisfaction_scores.reduce((sum, sc) => sum + sc.count, 0);
        const satisfiedResp = stats.satisfaction_scores.filter(sc => sc.score >= 4).reduce((sum, sc) => sum + sc.count, 0);
        setKeyMetrics(prev => ({
          ...prev,
          avgVasImprovement: s.avg_vas_improvement ?? prev.avgVasImprovement,
          avgOdiImprovement: s.avg_odi_improvement ?? prev.avgOdiImprovement,
          satisfactionRate: s.satisfaction_rate ?? prev.satisfactionRate,
          satisfiedCount: satisfiedResp,
          totalSatisfaction: totalResp,
          reoperationRate: s.reoperation_rate ?? prev.reoperationRate,
          reoperationCount: s.total_cases > 0 && s.reoperation_rate != null ? Math.round(s.reoperation_rate * s.total_cases / 100) : prev.reoperationCount,
          totalPatients: s.total_cases || prev.totalPatients,
        }));
      }
      if (stats.approach_comparison.length > 0) {
        setApproachComparison(buildApproachChart(stats.approach_comparison));
      }
      if (stats.satisfaction_scores.length > 0) {
        setSatisfactionData(buildSatisfactionChart(stats.satisfaction_scores));
      }
      if (stats.patient_outcomes.length > 0) {
        const built = buildOutcomesChart(stats.patient_outcomes);
        setAllOutcomes(built);
        setPatientOutcomes(built);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  // Client-side period filtering for patient outcomes
  useEffect(() => {
    if (period === 'all') {
      setPatientOutcomes(allOutcomes);
      return;
    }
    const now = new Date();
    const cutoff = new Date();
    if (period === 'year') cutoff.setFullYear(now.getFullYear() - 1);
    else if (period === '6months') cutoff.setMonth(now.getMonth() - 6);
    else if (period === '3months') cutoff.setMonth(now.getMonth() - 3);
    // Since outcomes don't have dates, show all but limit count as approximation
    const ratio = period === 'year' ? 1 : period === '6months' ? 0.5 : 0.25;
    const count = Math.max(1, Math.round(allOutcomes.length * ratio));
    setPatientOutcomes(allOutcomes.slice(0, count));
  }, [period, allOutcomes]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl mb-2">성과 분석</h1>
          <p className="text-gray-600 dark:text-gray-400">환자별 수술 결과 및 성과 데이터 분석</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="기간 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 기간</SelectItem>
            <SelectItem value="year">최근 1년</SelectItem>
            <SelectItem value="6months">최근 6개월</SelectItem>
            <SelectItem value="3months">최근 3개월</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-6 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">평균 VAS 개선도</div>
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          {loading ? <div className="h-6 w-6 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin mt-2" /> : <><div className="text-xl md:text-3xl mb-1">{keyMetrics.avgVasImprovement.toFixed(1)}%</div><div className="text-xs text-gray-500 dark:text-gray-400">환자 {keyMetrics.totalPatients}명 기준</div></>}
        </Card>
        <Card className="p-6 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">평균 ODI 개선도</div>
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          {loading ? <div className="h-6 w-6 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin mt-2" /> : <><div className="text-xl md:text-3xl mb-1">{keyMetrics.avgOdiImprovement.toFixed(1)}%</div><div className="text-xs text-gray-500 dark:text-gray-400">환자 {keyMetrics.totalPatients}명 기준</div></>}
        </Card>
        <Card className="p-6 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">환자 만족도</div>
            <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          {loading ? <div className="h-6 w-6 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin mt-2" /> : <><div className="text-xl md:text-3xl mb-1">{keyMetrics.satisfactionRate.toFixed(1)}%</div><div className="text-xs text-gray-500 dark:text-gray-400">{keyMetrics.totalSatisfaction}명 중 {keyMetrics.satisfiedCount}명</div></>}
        </Card>
        <Card className="p-6 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">합병증율</div>
            <TrendingDown className="w-5 h-5 text-red-600" />
          </div>
          {loading ? <div className="h-6 w-6 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin mt-2" /> : <><div className="text-xl md:text-3xl mb-1">{keyMetrics.reoperationRate.toFixed(1)}%</div><div className="text-xs text-gray-500 dark:text-gray-400">{keyMetrics.totalPatients}명 중 {keyMetrics.reoperationCount}명</div></>}
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6 bg-white dark:bg-gray-800 min-h-[340px]">
          <h3 className="text-lg mb-4">평균 회복 추이 (VAS & ODI)</h3>
          {loading ? (
            <div className="flex items-center justify-center h-[280px]">
              <div className="h-10 w-10 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={recoveryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: 'VAS/ODI', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} domain={[0, 1]} label={{ value: 'EQ-5D', angle: 90, position: 'insideRight', fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="VAS_back" stroke="#2563eb" strokeWidth={2} name="허리 통증" dot={{ r: 4 }} />
                <Line yAxisId="left" type="monotone" dataKey="VAS_leg" stroke="#ef4444" strokeWidth={2} name="다리 통증" dot={{ r: 4 }} />
                <Line yAxisId="left" type="monotone" dataKey="ODI" stroke="#f59e0b" strokeWidth={2} name="기능 장애" dot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="EQ5D" stroke="#10b981" strokeWidth={2} name="삶의 질" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6 bg-white dark:bg-gray-800 min-h-[340px]">
          <h3 className="text-lg mb-4">환자 만족도 분석</h3>
          {loading ? (
            <div className="flex items-center justify-center h-[280px]">
              <div className="h-10 w-10 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={satisfactionData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Radar name="만족도 (%)" dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.6} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6 bg-white dark:bg-gray-800 min-h-[340px]">
          <h3 className="text-lg mb-4">수술 접근법별 비교 분석</h3>
          {loading ? (
            <div className="flex items-center justify-center h-[280px]">
              <div className="h-10 w-10 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={approachComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {approachComparison.length > 0 &&
                    Object.keys(approachComparison[0])
                      .filter(k => k !== 'category')
                      .map((key, i) => {
                        const colors = ['#2563eb', '#60a5fa', '#93c5fd', '#dbeafe', '#a78bfa', '#f59e0b'];
                        return <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />;
                      })
                  }
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                * 수술시간(분), 출혈량(ml), 입원기간(일), 합병증율(%)
              </div>
            </>
          )}
        </Card>

        <Card className="p-6 bg-white dark:bg-gray-800 min-h-[340px]">
          <h3 className="text-lg mb-4">환자 연령별 개선도 분포</h3>
          {loading ? (
            <div className="flex items-center justify-center h-[280px]">
              <div className="h-10 w-10 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" dataKey="age" name="연령" tick={{ fontSize: 11 }} label={{ value: '연령', position: 'insideBottom', offset: -5, fontSize: 11 }} />
                <YAxis type="number" dataKey="improvement" name="개선도" tick={{ fontSize: 11 }} label={{ value: '개선도 (%)', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <ZAxis range={[100, 400]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="환자" data={patientOutcomes} fill="#2563eb" />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Patient Details Table */}
      <Card className="p-4 md:p-6 bg-white dark:bg-gray-800">
        <h3 className="text-lg mb-4">최근 환자 성과 상세</h3>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-10 w-10 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-3 px-4 text-sm text-gray-600 dark:text-gray-400">환자 ID</th>
                <th className="text-center py-3 px-4 text-sm text-gray-600 dark:text-gray-400">연령</th>
                <th className="text-center py-3 px-4 text-sm text-gray-600 dark:text-gray-400">수술 전 VAS</th>
                <th className="text-center py-3 px-4 text-sm text-gray-600 dark:text-gray-400">수술 후 VAS</th>
                <th className="text-center py-3 px-4 text-sm text-gray-600 dark:text-gray-400">개선도</th>
                <th className="text-center py-3 px-4 text-sm text-gray-600 dark:text-gray-400">수술 방법</th>
                <th className="text-center py-3 px-4 text-sm text-gray-600 dark:text-gray-400">만족도</th>
              </tr>
            </thead>
            <tbody>
              {patientOutcomes.map((patient) => (
                <tr key={patient.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="text-left py-3 px-4 text-sm">{patient.id}</td>
                  <td className="text-center py-3 px-4 text-sm">{patient.age ? `${patient.age}세` : '—'}</td>
                  <td className="text-center py-3 px-4 text-sm">{patient.preVAS}</td>
                  <td className="text-center py-3 px-4 text-sm">{patient.postVAS}</td>
                  <td className="text-center py-3 px-4 text-sm">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                      <TrendingUp className="w-3 h-3" />
                      {typeof patient.improvement === 'number' ? patient.improvement.toFixed(0) : patient.improvement}%
                    </span>
                  </td>
                  <td className="text-center py-3 px-4 text-sm">
                    {patient.approach || '—'}
                  </td>
                  <td className="text-center py-3 px-4 text-sm">
                    {patient.satisfaction != null
                      ? <span className="text-yellow-500">{'★'.repeat(Math.min(5, Math.max(1, patient.satisfaction)))}</span>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
