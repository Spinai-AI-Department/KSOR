import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Search, ChevronDown, Edit, MoreHorizontal, Plus, X, Calendar } from "lucide-react";
import { patientService, type Patient as ApiPatient } from "../api/patients";
import { dashboardService } from "../api/dashboard";
import { useAuth } from "../context/AuthContext";
import { CenterToast, ConfirmDialog, type ToastData } from "@/components/ui/toast-modal";

type FollowUpStatus = "Completed" | "Pending" | "Not Due" | "Overdue";
type TabType = "list" | "complication";

interface Patient {
  id: string;
  caseId: string;
  name: string;
  age: number;
  gender: "M" | "F";
  preOp: FollowUpStatus;
  m1: FollowUpStatus;
  m3: FollowUpStatus;
  m6: FollowUpStatus;
  yr1: FollowUpStatus;
}

const followUpPeriods = ["전체", "Pre-op", "1개월", "3개월", "6개월", "1년"];

function StatusBadge({ status }: { status: FollowUpStatus }) {
  const styles: Record<FollowUpStatus, string> = {
    Completed: "bg-green-100 text-green-700 border border-green-200",
    Pending:   "bg-yellow-100 text-yellow-700 border border-yellow-200",
    "Not Due": "bg-gray-100 text-gray-500 border border-gray-200",
    Overdue:   "bg-red-100 text-red-600 border border-red-200",
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${styles[status]}`}>
      {status}
    </span>
  );
}

function RecentFUStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "입력 완료": "bg-green-100 text-green-700 border border-green-200",
    "대기 중":   "bg-yellow-100 text-yellow-700 border border-yellow-200",
    "지연":      "bg-red-100 text-red-600 border border-red-200",
  };
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

// ─── 환자 목록 탭 ───────────────────────────────────────────────────────────
function PatientListTab() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState("");
  const [searchName, setSearchName] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("전체");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  // Patient list state
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const PAGE_SIZE = 20;

  // New patient form state
  const [newForm, setNewForm] = useState({ name: "", birth_date: "", gender: "M" as "M" | "F" });
  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Toast & confirm dialog
  const [toast, setToast] = useState<ToastData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ patientId: string; caseId: string } | null>(null);

  // AlimTalk
  type FollowUpPeriodKey = 'preOp' | 'm1' | 'm3' | 'm6' | 'yr1';
  const [alimtalkModal, setAlimtalkModal] = useState<{ patientId: string } | null>(null);
  const [sending, setSending] = useState(false);
  const PERIOD_LABELS: Record<FollowUpPeriodKey, string> = {
    preOp: '수술 전', m1: '1개월', m3: '3개월', m6: '6개월', yr1: '1년',
  };

  const [alimtalkError, setAlimtalkError] = useState<string | null>(null);

  const TIMEPOINT_MAP: Record<FollowUpPeriodKey, string> = {
    preOp: 'PRE_OP', m1: 'POST_1M', m3: 'POST_3M', m6: 'POST_6M', yr1: 'POST_1Y',
  };

  const handleSendAlimtalk = async (period: FollowUpPeriodKey) => {
    if (!token || !alimtalkModal) return;
    setSending(true);
    setAlimtalkError(null);
    try {
      // sendAlimtalk expects (caseId, { timepoint_code }, token)
      await patientService.sendAlimtalk(
        alimtalkModal.patientId,
        { timepoint_code: TIMEPOINT_MAP[period] },
        token
      );
      setAlimtalkModal(null);
      setToast({ type: 'success', message: 'AlimTalk이 성공적으로 발송되었습니다.' });
    } catch (err) {
      setAlimtalkError(err instanceof Error ? err.message : 'AlimTalk 발송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  const fetchPatients = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    try {
      const keyword = [searchId, searchName].filter(Boolean).join(' ').trim() || undefined;
      const periodFilterMap: Record<string, string | undefined> = {
        '전체': undefined, 'Pre-op': 'PRE_OP', '1개월': 'POST_1M',
        '3개월': 'POST_3M', '6개월': 'POST_6M', '1년': 'POST_1Y',
      };
      const status_filter = periodFilterMap[selectedPeriod];
      const res = await patientService.list(
        { keyword, status_filter, page, size: PAGE_SIZE },
        token
      );
      // Map ApiPatient to local Patient type
      setPatients(res.items.map((p: ApiPatient) => {
        // parse "M / 45" or "F / -"
        const [rawGender, rawAge] = p.genderAge.split('/').map(s => s.trim());
        const gender = (rawGender === 'F' ? 'F' : 'M') as 'M' | 'F';
        const age = rawAge && rawAge !== '-' ? parseInt(rawAge, 10) : 0;

        // Map prom_alimtalk timepoint statuses to follow-up columns
        const mapTimepointStatus = (timepointCode: string): FollowUpStatus => {
          const prom = p.promAlimtalk as Record<string, unknown>;
          if (!prom) return 'Not Due';

          // Preferred: flat followup_status map from backend { PRE_OP: "COMPLETED", ... }
          const fuStatus = prom.followup_status as Record<string, string> | undefined;
          if (fuStatus && fuStatus[timepointCode]) {
            const s = fuStatus[timepointCode];
            if (s === 'COMPLETED') return 'Completed';
            if (s === 'PENDING') return 'Pending';
            if (s === 'OVERDUE') return 'Overdue';
            return 'Not Due';
          }

          // Legacy: array of { timepoint_code, tracking_status }
          if (Array.isArray(prom)) {
            const entry = (prom as Array<Record<string, unknown>>).find(
              e => e.timepoint_code === timepointCode
            );
            if (!entry) return 'Not Due';
            const status = String(entry.tracking_status || '');
            if (status === 'SUBMITTED' || status === 'COMPLETED') return 'Completed';
            if (status === 'PENDING' || status === 'SENT' || status === 'OPENED') return 'Pending';
            if (status === 'OVERDUE' || status === 'EXPIRED') return 'Overdue';
            return 'Not Due';
          }
          // Legacy object form: { PRE_OP: { tracking_status: "..." }, POST_1M: { ... } }
          const entry = prom[timepointCode] as Record<string, unknown> | undefined;
          if (!entry) return 'Not Due';
          const status = String(entry.tracking_status || entry.status || '');
          if (status === 'SUBMITTED' || status === 'COMPLETED') return 'Completed';
          if (status === 'PENDING' || status === 'SENT' || status === 'OPENED') return 'Pending';
          if (status === 'OVERDUE' || status === 'EXPIRED') return 'Overdue';
          return 'Not Due';
        };

        return {
          id: p.id, caseId: p.caseId, name: p.name, age, gender,
          preOp: mapTimepointStatus('PRE_OP'),
          m1: mapTimepointStatus('POST_1M'),
          m3: mapTimepointStatus('POST_3M'),
          m6: mapTimepointStatus('POST_6M'),
          yr1: mapTimepointStatus('POST_1Y'),
        };
      }));
      setTotal(res.total);
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : '환자 목록을 불러오는데 실패했습니다.' });
    } finally {
      setListLoading(false);
    }
  }, [token, searchId, searchName, selectedPeriod, page]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const [recentFU, setRecentFU] = useState<{ id: string; name: string; status: string; date: string }[]>([]);

  useEffect(() => {
    if (!token) return;
    dashboardService.getRecentFollowups(token).then((data) => {
      const statusMap: Record<string, string> = {
        SUBMITTED: '입력 완료', COMPLETED: '입력 완료',
        PENDING: '대기 중', SENT: '대기 중', OPENED: '대기 중',
        OVERDUE: '지연', EXPIRED: '지연',
      };
      setRecentFU(data.map(fu => ({
        id: fu.registration_no,
        name: `${fu.patient_initial} (${fu.timepoint})`,
        status: statusMap[fu.status] ?? fu.status,
        date: fu.date,
      })));
    }).catch(() => {});
  }, [token]);

  const handleDeletePatient = (patientId: string, caseId: string) => {
    setDeleteConfirm({ patientId, caseId });
  };

  const executeDelete = async () => {
    if (!deleteConfirm || !token) return;
    try {
      await patientService.delete(deleteConfirm.caseId, token);
      setDeleteConfirm(null);
      fetchPatients();
    } catch (err) {
      setDeleteConfirm(null);
      setToast({ type: 'error', message: err instanceof Error ? err.message : '환자 삭제에 실패했습니다.' });
    }
  };

  const handleCreatePatient = async () => {
    const errors: Record<string, string> = {};
    if (!newForm.name) errors['이름'] = '환자 이름을 입력해주세요.';
    if (!newForm.birth_date) errors['생년월일'] = '생년월일을 선택해주세요.';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      // Focus the first error field in the modal
      setTimeout(() => {
        const firstKey = Object.keys(errors)[0];
        const el = document.querySelector<HTMLInputElement>(`[data-field="${firstKey}"]`);
        el?.focus();
      }, 0);
      return;
    }
    setFormErrors({});
    if (!token) return;
    setCreating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const birthYear = new Date(newForm.birth_date).getFullYear();
      await patientService.create(
        {
          patient_initial: newForm.name,
          sex: newForm.gender,
          birth_year: birthYear,
          birth_date: newForm.birth_date,
          visit_date: today,
        },
        token
      );
      setShowNewPatientModal(false);
      setNewForm({ name: "", birth_date: "", gender: "M" });
      fetchPatients();
    } catch (err) {
      const message = err instanceof Error ? err.message : '환자 등록에 실패했습니다.';
      setToast({ type: 'error', message });
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = patients;

  return (
    <>
      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Patient ID"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setPeriodOpen(!periodOpen)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 focus:outline-none w-48"
          >
            <span className="flex-1 text-left text-gray-600">
              {selectedPeriod === "전체" ? "Follow-up Period" : selectedPeriod}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          {periodOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
              {followUpPeriods.map((period) => (
                <button
                  key={period}
                  onClick={() => { setSelectedPeriod(period); setPeriodOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                    selectedPeriod === period ? "bg-blue-50 text-blue-700" : "text-gray-700"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowNewPatientModal(true)}
          className="ml-auto flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Patient
        </button>
      </div>

      {/* Patient Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 bg-white">
                <th className="text-left px-5 py-3.5 text-sm text-gray-700">Patient ID</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">Name</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">Age</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">Gender</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">Pre-op Status</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">1m Status</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">3m Status</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">6m Status</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">1yr Status</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((patient, index) => (
                <tr
                  key={`${patient.id}-${index}`}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-3.5 text-sm text-gray-800">{patient.id}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-800">{patient.name}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-800">{patient.age}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-800">{patient.gender}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={patient.preOp} /></td>
                  <td className="px-4 py-3.5"><StatusBadge status={patient.m1} /></td>
                  <td className="px-4 py-3.5"><StatusBadge status={patient.m3} /></td>
                  <td className="px-4 py-3.5"><StatusBadge status={patient.m6} /></td>
                  <td className="px-4 py-3.5"><StatusBadge status={patient.yr1} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 relative">
                      <button
                        className="p-1 text-gray-400 hover:text-gray-700 rounded"
                        onClick={() => navigate(`/surgery-entry?patient=${patient.caseId}`)}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 text-gray-400 hover:text-gray-700 rounded"
                        onClick={() =>
                          setOpenActionMenu(
                            openActionMenu === `${patient.id}-${index}` ? null : `${patient.id}-${index}`
                          )
                        }
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openActionMenu === `${patient.id}-${index}` && (
                        <div className="absolute top-full right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                            onClick={() => { setOpenActionMenu(null); navigate(`/surgery-entry?patient=${patient.caseId}&mode=view`); }}
                          >
                            상세 보기
                          </button>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            onClick={() => { setOpenActionMenu(null); navigate(`/surgery-entry?patient=${patient.caseId}&mode=followup`); }}
                          >
                            F/U 입력
                          </button>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                            onClick={() => { setAlimtalkModal({ patientId: patient.caseId }); setOpenActionMenu(null); }}
                          >
                            AlimTalk 발송
                          </button>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-b-lg"
                            onClick={() => { setOpenActionMenu(null); handleDeletePatient(patient.id, patient.caseId); }}
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-gray-400">
                    검색 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-sm text-gray-500">총 {total}명의 환자</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-7 h-7 rounded text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40">‹</button>
            {(() => {
              const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
              const endPage = Math.min(totalPages, startPage + 4);
              return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded text-sm ${p === page ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
                >
                  {p}
                </button>
              ));
            })()}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-7 h-7 rounded text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40">›</button>
          </div>
        </div>
      </div>

      {/* 최근 환자 F/U 현황 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base text-gray-900">최근 환자 F/U 현황</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {recentFU.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-800 font-mono">{item.id}</span>
                <span className="text-sm text-gray-600">{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400">{item.date}</span>
                <RecentFUStatusBadge status={item.status} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AlimTalk Period Modal */}
      {alimtalkModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setAlimtalkModal(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base text-gray-900">AlimTalk 발송 — 팔로업 기간 선택</h2>
              <button onClick={() => setAlimtalkModal(null)} className="p-1 text-gray-400 hover:text-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">환자 ID: <span className="font-mono text-gray-800">{alimtalkModal.patientId}</span></p>
            {alimtalkError && (
              <p className="text-sm text-red-600 mb-3">{alimtalkError}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(PERIOD_LABELS) as [FollowUpPeriodKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleSendAlimtalk(key)}
                  disabled={sending}
                  className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="환자 삭제"
        message={deleteConfirm ? `환자 ${deleteConfirm.patientId}를 정말 삭제하시겠습니까?` : ''}
        confirmLabel="삭제"
        cancelLabel="취소"
        variant="danger"
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Center Toast */}
      <CenterToast toast={toast} onClose={() => setToast(null)} />

      {/* New Patient Modal */}
      {showNewPatientModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewPatientModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg text-gray-900">신규 환자 등록</h2>
              <button onClick={() => setShowNewPatientModal(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">이름 (Name)</label>
                  <input
                    type="text"
                    data-field="이름"
                    placeholder="환자 이름"
                    value={newForm.name}
                    onChange={(e) => {
                      setNewForm((f) => ({ ...f, name: e.target.value }));
                      setFormErrors((prev) => { const { '이름': _, ...rest } = prev; return rest; });
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors['이름'] ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                  />
                  {formErrors['이름'] && <p className="text-xs text-red-500 mt-1">{formErrors['이름']}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">생년월일 (Birth Date)</label>
                  <input
                    type="date"
                    data-field="생년월일"
                    value={newForm.birth_date}
                    onChange={(e) => {
                      setNewForm((f) => ({ ...f, birth_date: e.target.value }));
                      setFormErrors((prev) => { const { '생년월일': _, ...rest } = prev; return rest; });
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${formErrors['생년월일'] ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                  />
                  {formErrors['생년월일'] && <p className="text-xs text-red-500 mt-1">{formErrors['생년월일']}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">성별 (Gender)</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="gender" value="M"
                      checked={newForm.gender === "M"}
                      onChange={() => setNewForm((f) => ({ ...f, gender: "M" }))}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">남성 (M)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="gender" value="F"
                      checked={newForm.gender === "F"}
                      onChange={() => setNewForm((f) => ({ ...f, gender: "F" }))}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">여성 (F)</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowNewPatientModal(false); setFormErrors({}); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreatePatient}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {creating ? "등록 중…" : "등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── 합병증 기록 탭 ──────────────────────────────────────────────────────────
function ComplicationTab() {
  const { token } = useAuth();

  // Patient lookup
  const [lookupId, setLookupId] = useState("");
  const [lookupName, setLookupName] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  const [isConversion, setIsConversion] = useState(true);
  const [isReoperation, setIsReoperation] = useState(false);
  const [conversionReason, setConversionReason] = useState("");
  const [reoperationDate, setReoperationDate] = useState("");
  const [severity, setSeverityOpen] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState("");
  const [occurrenceDate, setOccurrenceDate] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [complications, setComplications] = useState({
    duralTear: true,
    nerveInjury: false,
    hematoma: false,
    ssiSuperficial: false,
    ssiDeep: false,
    nonUnion: false,
    instrumentBreakage: false,
    instrumentDisplacement: false,
    otherMedical: false,
  });

  const toggleComp = (key: keyof typeof complications) => {
    setComplications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePatientLookup = () => {
    const id = lookupId.trim();
    if (!id) {
      setLookupMessage("Patient ID를 입력해주세요.");
      setSelectedCaseId(null);
      return;
    }
    setSelectedCaseId(id);
    setLookupMessage(`환자 ${id} 선택됨`);
  };

  const handleResetForm = () => {
    setLookupId("");
    setLookupName("");
    setSelectedCaseId(null);
    setLookupMessage(null);
    setIsConversion(false);
    setIsReoperation(false);
    setConversionReason("");
    setReoperationDate("");
    setSelectedSeverity("");
    setOccurrenceDate("");
    setSymptoms("");
    setSaveError(null);
    setSaveSuccess(false);
    setComplications({
      duralTear: false, nerveInjury: false, hematoma: false,
      ssiSuperficial: false, ssiDeep: false, nonUnion: false,
      instrumentBreakage: false, instrumentDisplacement: false, otherMedical: false,
    });
  };

  const handleSaveComplication = async () => {
    if (!selectedCaseId) {
      setSaveError("먼저 환자를 조회해주세요.");
      return;
    }
    if (!token) {
      setSaveError("로그인이 필요합니다.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const activeComps = Object.entries(complications)
        .filter(([, v]) => v)
        .map(([k]) => k);
      await patientService.updateOutcomes(selectedCaseId, {
        complications: activeComps,
        complication_severity: selectedSeverity || undefined,
        complication_date: occurrenceDate || undefined,
        complication_detail: symptoms || undefined,
        conversion_yn: isConversion,
        conversion_reason: isConversion ? conversionReason : undefined,
        reoperation_yn: isReoperation,
        reoperation_date: isReoperation ? reoperationDate : undefined,
      }, token);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const severityOptions = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];

  return (
    <div className="space-y-5">
      {/* Patient Selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-base text-gray-900 mb-4">대상 환자 선택</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Patient ID</label>
            <input
              type="text"
              placeholder="예: 201933070"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">이름 (Name)</label>
            <input
              type="text"
              placeholder="환자 이름"
              value={lookupName}
              onChange={(e) => setLookupName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handlePatientLookup}
              className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors"
            >
              환자 조회
            </button>
            {lookupMessage && (
              <span className={`text-sm ${selectedCaseId ? 'text-green-600' : 'text-red-600'}`}>{lookupMessage}</span>
            )}
          </div>
        </div>
      </div>

      {/* Conversion + Reoperation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 수술 중 전환 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base text-gray-900 mb-5">수술 중 전환 (Conversion to open)</h2>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setIsConversion(!isConversion)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isConversion ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  isConversion ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">개방형 전환 여부 (Is it a conversion?)</span>
          </div>
          <div>
            <input
              type="text"
              value={conversionReason}
              onChange={(e) => setConversionReason(e.target.value)}
              placeholder="전환 사유 (Reason for conversion)"
              disabled={!isConversion}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>

        {/* 재수술 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base text-gray-900 mb-5">재수술 (Reoperation)</h2>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setIsReoperation(!isReoperation)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isReoperation ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  isReoperation ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">재수술 여부 (Is it a reoperation?)</span>
          </div>
          <div className="relative">
            <input
              type="date"
              value={reoperationDate}
              onChange={(e) => setReoperationDate(e.target.value)}
              disabled={!isReoperation}
              placeholder="재수술 시행일 (Date of Reoperation)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 합병증 세부 기록 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-base text-gray-900 mb-5">합병증 세부 기록</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* 신경계 합병증 */}
          <div>
            <h3 className="text-sm text-gray-800 mb-4">신경계 합병증 (Neurological)</h3>
            <div className="space-y-3">
              {[
                { key: "duralTear" as const, label: "Dural tear (신경막 손상)" },
                { key: "nerveInjury" as const, label: "신경 손상 (Nerve Injury)" },
                { key: "hematoma" as const, label: "수술 후 혈종 (Postoperative Hematoma)" },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      complications[item.key] ? "border-blue-600 bg-blue-600" : "border-gray-300 group-hover:border-gray-400"
                    }`}
                    onClick={() => toggleComp(item.key)}
                  >
                    {complications[item.key] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700" onClick={() => toggleComp(item.key)}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 감염 및 치유 */}
          <div>
            <h3 className="text-sm text-gray-800 mb-4">감염 및 치유 (Infection &amp; Healing)</h3>
            <div className="space-y-3">
              {[
                { key: "ssiSuperficial" as const, label: "표층 수술 부위 감염 (Superficial SSI)" },
                { key: "ssiDeep" as const, label: "심부 수술 부위 감염 (Deep SSI)" },
                { key: "nonUnion" as const, label: "불유합 (Non-union)" },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      complications[item.key] ? "border-blue-600 bg-blue-600" : "border-gray-300 group-hover:border-gray-400"
                    }`}
                    onClick={() => toggleComp(item.key)}
                  >
                    {complications[item.key] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700" onClick={() => toggleComp(item.key)}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 기기 관련 및 기타 */}
          <div>
            <h3 className="text-sm text-gray-800 mb-4">기기 관련 및 기타 (Hardware &amp; Other)</h3>
            <div className="space-y-3">
              {[
                { key: "instrumentBreakage" as const, label: "기기 파손 (Instrument Breakage)" },
                { key: "instrumentDisplacement" as const, label: "기기 전위 (Instrument Displacement)" },
                { key: "otherMedical" as const, label: "기타 내과적 합병증 (Other Medical)" },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      complications[item.key] ? "border-blue-600 bg-blue-600" : "border-gray-300 group-hover:border-gray-400"
                    }`}
                    onClick={() => toggleComp(item.key)}
                  >
                    {complications[item.key] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700" onClick={() => toggleComp(item.key)}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 중증도 및 기록 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-base text-gray-900 mb-5">중증도 및 기록 (Severity &amp; Notes)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 합병증 발생일 */}
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">
              합병증 발생일 (Date of Occurrence)
            </label>
            <div className="relative">
              <input
                type="date"
                value={occurrenceDate}
                onChange={(e) => setOccurrenceDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 상세 증상 및 처치 */}
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">
              상세 증상 및 처치 (Detailed Symptoms &amp; Treatment)
            </label>
            <input
              type="text"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="증상 및 처치 내용"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 합병증 중증도 */}
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">
              합병증 중증도 (Complication Severity)
            </label>
            <div className="relative">
              <button
                onClick={() => setSeverityOpen(!severity)}
                className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className={selectedSeverity ? "text-gray-900" : "text-gray-400"}>
                  {selectedSeverity || "Grade 1, 2, 3, ..., Grade 1, ..."}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {severity && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                  {severityOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setSelectedSeverity(opt); setSeverityOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${
                        selectedSeverity === opt ? "bg-blue-50 text-blue-700" : "text-gray-700"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Buttons */}
      {saveError && (
        <p className="text-sm text-red-600 text-right mb-2">{saveError}</p>
      )}
      {saveSuccess && (
        <p className="text-sm text-green-600 text-right mb-2">저장되었습니다.</p>
      )}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleResetForm}
          className="px-6 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          초기화
        </button>
        <button
          onClick={handleSaveComplication}
          disabled={saving}
          className="px-8 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function PatientTracking() {
  const [activeTab, setActiveTab] = useState<TabType>("list");

  const tabs: { key: TabType; label: string }[] = [
    { key: "list", label: "환자 목록" },
    { key: "complication", label: "합병증 및 재수술 기록" },
  ];

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl text-gray-900">KOMISS / KSOR Registry</h1>
        <p className="text-gray-500 mt-1">Patient Management &amp; Follow-up Tracker</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm transition-colors ${
              activeTab === tab.key
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "list" ? <PatientListTab /> : <ComplicationTab />}
    </div>
  );
}
