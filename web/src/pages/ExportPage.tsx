import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

const monthlyData = [
  { month: '1월', surgeries: 18, complications: 1 },
  { month: '2월', surgeries: 22, complications: 0 },
  { month: '3월', surgeries: 25, complications: 2 },
  { month: '4월', surgeries: 20, complications: 1 },
  { month: '5월', surgeries: 28, complications: 0 },
  { month: '6월', surgeries: 24, complications: 1 },
];

const surgeryOutcomes = [
  { type: 'Full-endo', success: 95, improved: 98 },
  { type: 'UBE', success: 93, improved: 97 },
  { type: 'Biportal', success: 90, improved: 95 },
  { type: 'Open', success: 88, improved: 94 },
];

export function Reports() {
  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl mb-2">리포트</h1>
          <p className="text-gray-600">2026년 1월 - 6월 성과 리포트</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Calendar className="w-4 h-4" />
            기간 선택
          </Button>
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Download className="w-4 h-4" />
            PDF 다운로드
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-1">총 수술 건수</div>
          <div className="text-3xl mb-1">137건</div>
          <div className="text-xs text-green-600">+12% 전월 대비</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-1">평균 수술 성공률</div>
          <div className="text-3xl mb-1">92.7%</div>
          <div className="text-xs text-green-600">+2.1% 전월 대비</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-1">합병증 발생률</div>
          <div className="text-3xl mb-1">3.6%</div>
          <div className="text-xs text-red-600">+0.5% 전월 대비</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-1">평균 입원 기간</div>
          <div className="text-3xl mb-1">2.8일</div>
          <div className="text-xs text-green-600">-0.3일 전월 대비</div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Surgery Volume */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">월별 수술 건수 및 합병증</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="surgeries" fill="#2563eb" name="수술 건수" radius={[4, 4, 0, 0]} />
              <Bar dataKey="complications" fill="#ef4444" name="합병증" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Surgery Outcomes by Type */}
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">수술 방법별 성과</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={surgeryOutcomes} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="success" fill="#10b981" name="완전 성공률 (%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="improved" fill="#60a5fa" name="개선율 (%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="p-4 md:p-6 bg-white">
        <h3 className="text-lg mb-4">주요 지표 상세</h3>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm text-gray-600">항목</th>
              <th className="text-right py-3 px-4 text-sm text-gray-600">1월</th>
              <th className="text-right py-3 px-4 text-sm text-gray-600">2월</th>
              <th className="text-right py-3 px-4 text-sm text-gray-600">3월</th>
              <th className="text-right py-3 px-4 text-sm text-gray-600">4월</th>
              <th className="text-right py-3 px-4 text-sm text-gray-600">5월</th>
              <th className="text-right py-3 px-4 text-sm text-gray-600">6월</th>
              <th className="text-right py-3 px-4 text-sm text-gray-600">평균</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-3 px-4 text-sm">평균 수술 시간 (분)</td>
              <td className="text-right py-3 px-4 text-sm">95</td>
              <td className="text-right py-3 px-4 text-sm">92</td>
              <td className="text-right py-3 px-4 text-sm">88</td>
              <td className="text-right py-3 px-4 text-sm">90</td>
              <td className="text-right py-3 px-4 text-sm">87</td>
              <td className="text-right py-3 px-4 text-sm">85</td>
              <td className="text-right py-3 px-4 text-sm">89.5</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-3 px-4 text-sm">평균 출혈량 (ml)</td>
              <td className="text-right py-3 px-4 text-sm">45</td>
              <td className="text-right py-3 px-4 text-sm">42</td>
              <td className="text-right py-3 px-4 text-sm">38</td>
              <td className="text-right py-3 px-4 text-sm">40</td>
              <td className="text-right py-3 px-4 text-sm">35</td>
              <td className="text-right py-3 px-4 text-sm">32</td>
              <td className="text-right py-3 px-4 text-sm">38.7</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-3 px-4 text-sm">환자 만족도 (%)</td>
              <td className="text-right py-3 px-4 text-sm">94</td>
              <td className="text-right py-3 px-4 text-sm">95</td>
              <td className="text-right py-3 px-4 text-sm">93</td>
              <td className="text-right py-3 px-4 text-sm">96</td>
              <td className="text-right py-3 px-4 text-sm">97</td>
              <td className="text-right py-3 px-4 text-sm">98</td>
              <td className="text-right py-3 px-4 text-sm">95.5</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-3 px-4 text-sm">재입원율 (%)</td>
              <td className="text-right py-3 px-4 text-sm">2.1</td>
              <td className="text-right py-3 px-4 text-sm">1.8</td>
              <td className="text-right py-3 px-4 text-sm">2.5</td>
              <td className="text-right py-3 px-4 text-sm">1.9</td>
              <td className="text-right py-3 px-4 text-sm">1.5</td>
              <td className="text-right py-3 px-4 text-sm">1.2</td>
              <td className="text-right py-3 px-4 text-sm">1.8</td>
            </tr>
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}