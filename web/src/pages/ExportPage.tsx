import { useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportService, type ReportData } from '../api/reports';
import { useAuth } from '../context/AuthContext';

const EMPTY_DATA: ReportData = {
  summary: { total_surgeries: 0, success_rate: 0, complication_rate: 0, avg_hospital_days: 0 },
  monthly_trend: [],
  surgery_outcomes: [],
};

// Default date range: current year
function getDefaultDates() {
  const now = new Date();
  const y = now.getFullYear();
  return {
    from: `${y}-01-01`,
    to: `${now.toISOString().slice(0, 10)}`,
  };
}

export function Reports() {
  const { token } = useAuth();
  const [dateFrom, setDateFrom] = useState(getDefaultDates().from);
  const [dateTo, setDateTo]     = useState(getDefaultDates().to);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [data, setData]         = useState<ReportData>(EMPTY_DATA);
  const [loading, setLoading]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    reportService.getData({ date_from: dateFrom, date_to: dateTo }, token)
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : '리포트 데이터를 불러오는데 실패했습니다.');
      })
      .finally(() => setLoading(false));
  }, [token, dateFrom, dateTo]);

  const handleDownloadPdf = async () => {
    if (!token) return;
    setDownloading(true);
    try {
      const blob = await reportService.downloadPdf({ date_from: dateFrom, date_to: dateTo }, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ksor_report_${dateFrom}_${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const { summary, monthly_trend, surgery_outcomes } = data;

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl mb-2">리포트</h1>
          <p className="text-gray-600">{dateFrom} ~ {dateTo} 성과 리포트</p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          {showDatePicker && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400 text-sm">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setShowDatePicker((v) => !v)}>
            <Calendar className="w-4 h-4" />
            기간 선택
          </Button>
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={handleDownloadPdf}
            disabled={downloading || !token}
          >
            <Download className="w-4 h-4" />
            {downloading ? 'CSV 생성 중…' : 'CSV 다운로드'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-1">총 수술 건수</div>
          <div className="text-3xl mb-1">{loading ? '…' : `${summary.total_surgeries}건`}</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-1">평균 수술 성공률</div>
          <div className="text-3xl mb-1">{loading ? '…' : `${summary.success_rate}%`}</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-1">합병증 발생률</div>
          <div className="text-3xl mb-1">{loading ? '…' : `${summary.complication_rate}%`}</div>
        </Card>
        <Card className="p-6 bg-white">
          <div className="text-sm text-gray-600 mb-1">평균 입원 기간</div>
          <div className="text-3xl mb-1">{loading ? '…' : `${summary.avg_hospital_days}일`}</div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">월별 수술 건수 및 합병증</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="surgeries"     fill="#2563eb" name="수술 건수" radius={[4, 4, 0, 0]} />
              <Bar dataKey="complications" fill="#ef4444" name="합병증"   radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6 bg-white">
          <h3 className="text-lg mb-4">수술 방법별 성과</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={surgery_outcomes} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="success"  fill="#10b981" name="완전 성공률 (%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="improved" fill="#60a5fa" name="개선율 (%)"     radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="p-4 md:p-6 bg-white">
        <h3 className="text-lg mb-4">월별 수술 현황 상세</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm text-gray-600">월</th>
                <th className="text-right py-3 px-4 text-sm text-gray-600">수술 건수</th>
                <th className="text-right py-3 px-4 text-sm text-gray-600">합병증</th>
                <th className="text-right py-3 px-4 text-sm text-gray-600">합병증 비율</th>
              </tr>
            </thead>
            <tbody>
              {monthly_trend.map((row) => (
                <tr key={row.month} className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm">{row.month}</td>
                  <td className="text-right py-3 px-4 text-sm">{row.surgeries}</td>
                  <td className="text-right py-3 px-4 text-sm">{row.complications}</td>
                  <td className="text-right py-3 px-4 text-sm">
                    {row.surgeries > 0 ? `${((row.complications / row.surgeries) * 100).toFixed(1)}%` : '-'}
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
