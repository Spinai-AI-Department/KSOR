import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card } from "@/components/ui/card";

const vasOdiData = [
  { month: '수술전', 허리통증: 22, 다리통증: 21, 기능장애: 20 },
  { month: '1개월', 허리통증: 18, 다리통증: 16, 기능장애: 14 },
  { month: '3개월', 허리통증: 12, 다리통증: 10, 기능장애: 8 },
  { month: '6개월', 허리통증: 6, 다리통증: 5, 기능장애: 4 },
  { month: '1년', 허리통증: 3, 다리통증: 2, 기능장애: 2 },
];

const surgeryTypeData = [
  { name: 'Full-endo', value: 45, color: '#2563eb' },
  { name: 'UBE', value: 30, color: '#60a5fa' },
  { name: 'Biportal', value: 15, color: '#93c5fd' },
  { name: 'Open', value: 10, color: '#dbeafe' },
];

export function Dashboard() {
  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl mb-2">KOMISS / KSOR</h1>
        <p className="text-gray-600">개인 성과 분석 대시보드</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 md:mb-8">
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-2">총 수술 건수</div>
          <div className="text-4xl">250</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-2">평균 수술 시간</div>
          <div className="text-4xl">90분</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-2">합병증 및 재수술</div>
          <div className="text-4xl">2 건</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-2">연구 논문 수</div>
          <div className="text-4xl">N/A</div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 md:mb-8">
        {/* VAS & ODI Chart */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">환자 회복 추이 (VAS & ODI)</h3>
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
            <LineChart data={vasOdiData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="허리통증" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="다리통증" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="기능장애" stroke="#93c5fd" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Surgery Type Distribution */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">수술 접근법 비율</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={surgeryTypeData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {surgeryTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-around mt-4 text-sm">
            {surgeryTypeData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: entry.color }}></div>
                <span>{entry.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Patient F/U */}
      <Card className="p-6 bg-white">
        <h3 className="text-lg mb-4">최근 환자 F/U 현황</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-gray-700">201933070</span>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">입력 완료</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
