import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ScatterChart, Scatter, ZAxis } from 'recharts';
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const recoveryData = [
  { period: '수술 전', VAS_back: 8.2, VAS_leg: 7.8, ODI: 68, EQ5D: 0.42 },
  { period: '1개월', VAS_back: 4.5, VAS_leg: 3.8, ODI: 42, EQ5D: 0.65 },
  { period: '3개월', VAS_back: 2.8, VAS_leg: 2.1, ODI: 28, EQ5D: 0.78 },
  { period: '6개월', VAS_back: 1.5, VAS_leg: 1.2, ODI: 15, EQ5D: 0.85 },
  { period: '12개월', VAS_back: 0.8, VAS_leg: 0.6, ODI: 8, EQ5D: 0.92 },
];

const approachComparison = [
  { category: '수술시간', 'Full-endo': 75, 'UBE': 85, 'Biportal': 95, 'Open': 120 },
  { category: '출혈량', 'Full-endo': 20, 'UBE': 35, 'Biportal': 50, 'Open': 150 },
  { category: '입원기간', 'Full-endo': 1.5, 'UBE': 2.0, 'Biportal': 2.5, 'Open': 4.5 },
  { category: '합병증율', 'Full-endo': 2.1, 'UBE': 2.8, 'Biportal': 3.5, 'Open': 5.2 },
];

const satisfactionData = [
  { subject: '통증감소', score: 95 },
  { subject: '일상복귀', score: 88 },
  { subject: '수술만족', score: 92 },
  { subject: '재수술의향', score: 96 },
  { subject: '추천의향', score: 94 },
];

const patientOutcomes = [
  { id: 1, age: 45, preVAS: 8.5, postVAS: 1.2, improvement: 86 },
  { id: 2, age: 52, preVAS: 7.8, postVAS: 2.1, improvement: 73 },
  { id: 3, age: 38, preVAS: 9.0, postVAS: 0.8, improvement: 91 },
  { id: 4, age: 61, preVAS: 7.2, postVAS: 1.8, improvement: 75 },
  { id: 5, age: 48, preVAS: 8.8, postVAS: 1.5, improvement: 83 },
  { id: 6, age: 55, preVAS: 7.5, postVAS: 2.3, improvement: 69 },
  { id: 7, age: 42, preVAS: 8.2, postVAS: 1.0, improvement: 88 },
  { id: 8, age: 58, preVAS: 7.9, postVAS: 1.7, improvement: 78 },
];

export function SurgeryAnalysis() {
  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl mb-2">성과 분석</h1>
          <p className="text-gray-600">환자별 수술 결과 및 성과 데이터 분석</p>
        </div>
        <Select defaultValue="all">
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
        <Card className="p-6 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">평균 VAS 개선도</div>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-3xl mb-1">82.4%</div>
          <div className="text-xs text-gray-500">8.1 → 1.4 (평균)</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">평균 ODI 개선도</div>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-3xl mb-1">88.2%</div>
          <div className="text-xs text-gray-500">68 → 8 (평균)</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">환자 만족도</div>
            <Activity className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-3xl mb-1">93.8%</div>
          <div className="text-xs text-gray-500">250명 중 235명</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">재수술율</div>
            <TrendingDown className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-3xl mb-1">0.8%</div>
          <div className="text-xs text-gray-500">250명 중 2명</div>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Recovery Timeline */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">평균 회복 추이 (VAS & ODI)</h3>
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
        </Card>

        {/* Patient Satisfaction Radar */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">환자 만족도 분석</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={satisfactionData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Radar name="만족도 (%)" dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.6} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Approach Comparison */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">수술 접근법별 비교 분석</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={approachComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Full-endo" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="UBE" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Biportal" fill="#93c5fd" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Open" fill="#dbeafe" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="text-xs text-gray-500 mt-2">
            * 수술시간(분), 출혈량(ml), 입원기간(일), 합병증율(%)
          </div>
        </Card>

        {/* Patient Outcomes Scatter */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">환자 연령별 개선도 분포</h3>
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
        </Card>
      </div>

      {/* Patient Details Table */}
      <Card className="p-4 md:p-6 bg-white">
        <h3 className="text-lg mb-4">최근 환자 성과 상세</h3>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm text-gray-600">환자 ID</th>
              <th className="text-center py-3 px-4 text-sm text-gray-600">연령</th>
              <th className="text-center py-3 px-4 text-sm text-gray-600">수술 전 VAS</th>
              <th className="text-center py-3 px-4 text-sm text-gray-600">수술 후 VAS</th>
              <th className="text-center py-3 px-4 text-sm text-gray-600">개선도</th>
              <th className="text-center py-3 px-4 text-sm text-gray-600">수술 방법</th>
              <th className="text-center py-3 px-4 text-sm text-gray-600">만족도</th>
            </tr>
          </thead>
          <tbody>
            {patientOutcomes.map((patient, index) => (
              <tr key={patient.id} className="border-b border-gray-100">
                <td className="py-3 px-4 text-sm">2019330{70 + index}</td>
                <td className="text-center py-3 px-4 text-sm">{patient.age}세</td>
                <td className="text-center py-3 px-4 text-sm">{patient.preVAS}</td>
                <td className="text-center py-3 px-4 text-sm">{patient.postVAS}</td>
                <td className="text-center py-3 px-4 text-sm">
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                    <TrendingUp className="w-3 h-3" />
                    {patient.improvement}%
                  </span>
                </td>
                <td className="text-center py-3 px-4 text-sm">
                  {index % 4 === 0 ? 'Full-endo' : index % 4 === 1 ? 'UBE' : index % 4 === 2 ? 'Biportal' : 'Open'}
                </td>
                <td className="text-center py-3 px-4 text-sm">
                  <span className="text-yellow-500">{'★'.repeat(patient.improvement >= 85 ? 5 : patient.improvement >= 75 ? 4 : 3)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}