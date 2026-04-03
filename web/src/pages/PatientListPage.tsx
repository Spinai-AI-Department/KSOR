import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import { Search, ChevronDown, Edit, MoreHorizontal, Plus, X, Calendar } from "lucide-react";
import { patientService, type Patient as ApiPatient } from "../api/patients";
import { dashboardService } from "../api/dashboard";
import { ApiValidationError, translateValidationMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ConfirmDialog } from "@/components/ui/toast-modal";

type FollowUpStatus = "Completed" | "Pending" | "Not Due" | "Overdue";
type TimepointKey = "preOp" | "m1" | "m3" | "m6" | "yr1";
type TabType = "list" | "complication";

interface Patient {
  id: string;
  caseId: string;
  registrationId: string;
  name: string;
  genderAge: string;
  visitDate: string;
  surgeryDate: string | null;
  diagnosisCode: string | null;
  procedureCode: string | null;
  preOp: FollowUpStatus;
  m1: FollowUpStatus;
  m3: FollowUpStatus;
  m6: FollowUpStatus;
  yr1: FollowUpStatus;
  followupTimepoints: string[];
  overdueInfo: Partial<Record<TimepointKey, number>>;
}

const followUpPeriods = ["전체", "Pre-op", "1개월", "3개월", "6개월", "1년"];

function formatOverdue(days: number): string {
  if (days < 7) return `+${days}d`;
  if (days < 30) return `+${Math.floor(days / 7)}w`;
  return `+${Math.floor(days / 30)}m`;
}

function StatusBadge({ status, overdueDays }: { status: FollowUpStatus; overdueDays?: number }) {
  const styles: Record<FollowUpStatus, string> = {
    Completed: "bg-green-100 text-green-700 border border-green-200",
    Pending:   "bg-yellow-100 text-yellow-700 border border-yellow-200",
    "Not Due": "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600",
    Overdue:   "bg-red-100 text-red-600 border border-red-200",
  };
  const label = status === "Overdue" && overdueDays != null && overdueDays > 0
    ? `Overdue ${formatOverdue(overdueDays)}`
    : status;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${styles[status]}`}>
      {label}
    </span>
  );
}

const TIMEPOINT_CODE_MAP: Record<string, string> = {
  preOp: "PRE_OP", m1: "POST_1M", m3: "POST_3M", m6: "POST_6M", yr1: "POST_1Y",
};

function FollowUpCell({ status, timepointKey, followupTimepoints, overdueDays }: {
  status: FollowUpStatus;
  timepointKey: string;
  followupTimepoints: string[];
  overdueDays?: number;
}) {
  const code = TIMEPOINT_CODE_MAP[timepointKey];
  const isScheduled = followupTimepoints.includes(code);

  // Not scheduled and no activity → show dash
  if (!isScheduled && status === "Not Due") {
    return <span className="text-gray-300 dark:text-gray-600">—</span>;
  }

  return <StatusBadge status={status} overdueDays={overdueDays} />;
}

function RecentFUStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "입력 완료": "bg-green-100 text-green-700 border border-green-200",
    "대기 중":   "bg-yellow-100 text-yellow-700 border border-yellow-200",
    "지연":      "bg-red-100 text-red-600 border border-red-200",
  };
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
      {status}
    </span>
  );
}

// ─── 캐시 인터페이스 ─────────────────────────────────────────────────────────
interface PatientListCache {
  patients: Patient[];
  total: number;
}

// ─── 환자 목록 탭 ───────────────────────────────────────────────────────────
function PatientListTab({ cache, onCacheUpdate }: {
  cache: PatientListCache | null;
  onCacheUpdate: (c: PatientListCache) => void;
}) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchId, setSearchId] = useState("");
  const [searchName, setSearchName] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("전체");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  // Patient list state — seed from cache if available
  const [patients, setPatients] = useState<Patient[]>(cache?.patients ?? []);
  const [total, setTotal] = useState(cache?.total ?? 0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const hasCacheRef = useState(() => cache !== null)[0]; // true if mounted with cache
  const PAGE_SIZE = 20;

  // New patient form state
  const [newForm, setNewForm] = useState({ name: "", birth_date: "", gender: "M" as "M" | "F" });
  const [creating, setCreating] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Inline messages & confirm dialog
  const [listError, setListError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
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
      setSuccessMsg('AlimTalk이 성공적으로 발송되었습니다.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      if (err instanceof ApiValidationError) {
        const labelMap: Record<string, string> = { timepoint_code: '추적 관찰 시점', expires_in_days: '만료일' };
        const labels = err.fields.map(fe => `${labelMap[fe.field] ?? fe.field} — ${translateValidationMsg(fe.message)}`);
        setAlimtalkError(`다음 항목을 확인해주세요: ${labels.join(', ')}`);
      } else {
        setAlimtalkError(err instanceof Error ? err.message : 'AlimTalk 발송에 실패했습니다.');
      }
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
      const mapped = res.items.map((p: ApiPatient) => {
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

        const prom = p.promAlimtalk as Record<string, unknown>;
        const followupTimepoints = (prom?.followup_timepoints as string[] | undefined) ?? [];

        const TIMEPOINT_DAY_OFFSET: Record<string, number> = {
          PRE_OP: 0, POST_1M: 30, POST_3M: 90, POST_6M: 180, POST_1Y: 365,
        };
        const calcOverdueDays = (timepointCode: string): number => {
          if (!p.surgeryDate) return 0;
          const offset = TIMEPOINT_DAY_OFFSET[timepointCode];
          if (offset == null) return 0;
          const expected = new Date(p.surgeryDate);
          expected.setDate(expected.getDate() + offset);
          expected.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return Math.max(0, Math.floor((today.getTime() - expected.getTime()) / 86400000));
        };

        return {
          id: p.id, caseId: p.caseId, registrationId: p.registrationId, name: p.name,
          genderAge: p.genderAge, visitDate: p.visitDate,
          surgeryDate: p.surgeryDate, diagnosisCode: p.diagnosisCode, procedureCode: p.procedureCode,
          preOp: mapTimepointStatus('PRE_OP'),
          m1: mapTimepointStatus('POST_1M'),
          m3: mapTimepointStatus('POST_3M'),
          m6: mapTimepointStatus('POST_6M'),
          yr1: mapTimepointStatus('POST_1Y'),
          followupTimepoints,
          overdueInfo: {
            preOp: calcOverdueDays('PRE_OP'),
            m1: calcOverdueDays('POST_1M'),
            m3: calcOverdueDays('POST_3M'),
            m6: calcOverdueDays('POST_6M'),
            yr1: calcOverdueDays('POST_1Y'),
          },
        };
      });
      setPatients(mapped);
      setTotal(res.total);
      onCacheUpdate({ patients: mapped, total: res.total });
    } catch (err) {
      setListError(err instanceof Error ? err.message : '환자 목록을 불러오는데 실패했습니다.');
    } finally {
      setListLoading(false);
    }
  }, [token, searchId, searchName, selectedPeriod, page, onCacheUpdate]);

  // Skip initial fetch if mounted with cached data (default filters, page 1)
  const skipInitialFetch = useCallback(() => {
    return hasCacheRef && page === 1 && searchId === '' && searchName === '' && selectedPeriod === '전체';
  }, [hasCacheRef, page, searchId, searchName, selectedPeriod]);

  useEffect(() => {
    if (skipInitialFetch()) return;
    fetchPatients();
  }, [fetchPatients, skipInitialFetch]);

  // Show success toast when navigated back from surgery-entry after save
  useEffect(() => {
    if ((location.state as { saved?: boolean } | null)?.saved) {
      setSuccessMsg('저장되었습니다.');
      setTimeout(() => setSuccessMsg(null), 1000);
      // Clear the state so it doesn't re-trigger on tab switch / refresh
      navigate('.', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

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
        id: fu.registration_id,
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
    if (!deleteConfirm) return;
    if (!token) return;
    try {
      await patientService.delete(deleteConfirm.caseId, token);
      setDeleteConfirm(null);
      fetchPatients();
    } catch (err) {
      setDeleteConfirm(null);
      setListError(err instanceof Error ? err.message : '환자 삭제에 실패했습니다.');
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
      if (err instanceof ApiValidationError) {
        // backend field → data-field attribute (Korean labels used in modal)
        const fieldMap: Record<string, string> = {
          patient_initial: '이름', sex: '성별', birth_date: '생년월일', birth_year: '생년월일', visit_date: '내원일',
        };
        // backend field → user-friendly Korean label for error message
        const labelMap: Record<string, string> = {
          patient_initial: '환자 이름', sex: '성별', birth_date: '생년월일', birth_year: '출생연도', visit_date: '내원일',
        };
        const errors: Record<string, string> = {};
        const errorLabels: string[] = [];
        for (const fe of err.fields) {
          const mapped = fieldMap[fe.field] ?? fe.field;
          const label = labelMap[fe.field] ?? fe.field;
          errors[mapped] = `${label}: ${translateValidationMsg(fe.message)}`;
          errorLabels.push(label);
        }
        setFormErrors(errors);
        setCreateError(`다음 항목을 확인해주세요: ${errorLabels.join(', ')}`);
        setTimeout(() => {
          const firstField = Object.keys(errors)[0];
          const el = document.querySelector<HTMLElement>(`[data-field="${firstField}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (el instanceof HTMLInputElement) el.focus();
          }
        }, 0);
      } else {
        setCreateError(err instanceof Error ? err.message : '환자 등록에 실패했습니다.');
      }
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = patients;

  return (
    <>
      {listError && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700">
          {listError}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="환자 번호"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="이름"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setPeriodOpen(!periodOpen)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none w-48"
          >
            <span className="flex-1 text-left text-gray-600 dark:text-gray-400">
              {selectedPeriod === "전체" ? "팔로업 기간" : selectedPeriod}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          {periodOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10">
              {followUpPeriods.map((period) => (
                <button
                  key={period}
                  onClick={() => { setSelectedPeriod(period); setPeriodOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg ${
                    selectedPeriod === period ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700" : "text-gray-700 dark:text-gray-300"
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
          신규 등록
        </button>
      </div>

      {/* Patient Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm mb-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700">
                <th className="text-left px-5 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">번호</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">환자 번호</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">이름</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">성별/나이</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">내원일</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">수술일</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">진단코드</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">수술코드</th>
                <th className="text-center px-3 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">Pre-op</th>
                <th className="text-center px-3 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">1M</th>
                <th className="text-center px-3 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">3M</th>
                <th className="text-center px-3 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">6M</th>
                <th className="text-center px-3 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">1Y</th>
                <th className="text-left px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && (
                <tr>
                  <td colSpan={14} className="py-16 text-center">
                    <div className="inline-block h-12 w-12 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
                  </td>
                </tr>
              )}
              {!listLoading && filtered.map((patient, index) => (
                <tr
                  key={`${patient.id}-${index}`}
                  className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td className="text-left px-5 py-3.5 text-sm text-gray-800 dark:text-gray-200 font-mono whitespace-nowrap">{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td className="text-left px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200 font-mono whitespace-nowrap">{patient.id}</td>
                  <td className="text-left px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">{patient.name}</td>
                  <td className="text-left px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">{patient.genderAge}</td>
                  <td className="text-left px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">{patient.visitDate || "-"}</td>
                  <td className="text-left px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">{patient.surgeryDate || "-"}</td>
                  <td className="text-left px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">{patient.diagnosisCode || "-"}</td>
                  <td className="text-left px-4 py-3.5 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">{patient.procedureCode || "-"}</td>
                  <td className="px-3 py-3.5 text-center"><FollowUpCell status={patient.preOp} timepointKey="preOp" followupTimepoints={patient.followupTimepoints} overdueDays={patient.overdueInfo.preOp} /></td>
                  <td className="px-3 py-3.5 text-center"><FollowUpCell status={patient.m1} timepointKey="m1" followupTimepoints={patient.followupTimepoints} overdueDays={patient.overdueInfo.m1} /></td>
                  <td className="px-3 py-3.5 text-center"><FollowUpCell status={patient.m3} timepointKey="m3" followupTimepoints={patient.followupTimepoints} overdueDays={patient.overdueInfo.m3} /></td>
                  <td className="px-3 py-3.5 text-center"><FollowUpCell status={patient.m6} timepointKey="m6" followupTimepoints={patient.followupTimepoints} overdueDays={patient.overdueInfo.m6} /></td>
                  <td className="px-3 py-3.5 text-center"><FollowUpCell status={patient.yr1} timepointKey="yr1" followupTimepoints={patient.followupTimepoints} overdueDays={patient.overdueInfo.yr1} /></td>
                  <td className="text-left px-4 py-3.5">
                    <div className="flex items-center gap-2 relative">
                      <button
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded"
                        onClick={() => navigate(`/surgery-entry?patient=${patient.caseId}`, { state: { patient } })}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded"
                        onClick={() =>
                          setOpenActionMenu(
                            openActionMenu === `${patient.id}-${index}` ? null : `${patient.id}-${index}`
                          )
                        }
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openActionMenu === `${patient.id}-${index}` && (
                        <div className="absolute top-full right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-20">
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
                            onClick={() => { setOpenActionMenu(null); navigate(`/surgery-entry?patient=${patient.caseId}&mode=view`, { state: { patient } }); }}
                          >
                            상세 보기
                          </button>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => { setOpenActionMenu(null); navigate(`/surgery-entry?patient=${patient.caseId}&mode=followup`, { state: { patient } }); }}
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
              {filtered.length === 0 && !listLoading && (
                <tr>
                  <td colSpan={14} className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    검색 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">총 {total}명의 환자</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-7 h-7 rounded text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40">‹</button>
            {(() => {
              const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
              const endPage = Math.min(totalPages, startPage + 4);
              return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded text-sm ${p === page ? "bg-gray-900 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                >
                  {p}
                </button>
              ));
            })()}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-7 h-7 rounded text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40">›</button>
          </div>
        </div>
      </div>

      {/* 최근 환자 F/U 현황 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base text-gray-900 dark:text-gray-100">최근 환자 F/U 현황</h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-600">
          {recentFU.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-800 dark:text-gray-200 font-mono">{item.id}</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400 dark:text-gray-500">{item.date}</span>
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base text-gray-900 dark:text-gray-100">AlimTalk 발송 — 팔로업 기간 선택</h2>
              <button onClick={() => setAlimtalkModal(null)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">환자 ID: <span className="font-mono text-gray-800 dark:text-gray-200">{alimtalkModal.patientId}</span></p>
            {alimtalkError && (
              <p className="text-sm text-red-600 mb-3">{alimtalkError}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(PERIOD_LABELS) as [FollowUpPeriodKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleSendAlimtalk(key)}
                  disabled={sending}
                  className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-700 transition-colors disabled:opacity-50"
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

      {/* New Patient Modal */}
      {showNewPatientModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewPatientModal(false); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg text-gray-900 dark:text-gray-100">신규 환자 등록</h2>
              <button onClick={() => setShowNewPatientModal(false)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">이름 (Name)</label>
                  <input
                    type="text"
                    data-field="이름"
                    placeholder="환자 이름"
                    maxLength={20}
                    value={newForm.name}
                    onChange={(e) => {
                      setNewForm((f) => ({ ...f, name: e.target.value }));
                      setFormErrors((prev) => { const { '이름': _, ...rest } = prev; return rest; });
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 ${formErrors['이름'] ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  />
                  {formErrors['이름'] && <p className="text-xs text-red-500 mt-1">{formErrors['이름']}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">생년월일 (Birth Date)</label>
                  <input
                    type="date"
                    max="9999-12-31"
                    data-field="생년월일"
                    value={newForm.birth_date}
                    onChange={(e) => {
                      setNewForm((f) => ({ ...f, birth_date: e.target.value }));
                      setFormErrors((prev) => { const { '생년월일': _, ...rest } = prev; return rest; });
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 ${formErrors['생년월일'] ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  />
                  {formErrors['생년월일'] && <p className="text-xs text-red-500 mt-1">{formErrors['생년월일']}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">성별 (Gender)</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="gender" value="M"
                      checked={newForm.gender === "M"}
                      onChange={() => setNewForm((f) => ({ ...f, gender: "M" }))}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">남성 (M)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="gender" value="F"
                      checked={newForm.gender === "F"}
                      onChange={() => setNewForm((f) => ({ ...f, gender: "F" }))}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">여성 (F)</span>
                  </label>
                </div>
              </div>
            </div>
            {createError && (
              <p className="text-sm text-red-600 mt-3">{createError}</p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowNewPatientModal(false); setFormErrors({}); }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreatePatient}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-50 transition-colors disabled:opacity-50"
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

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResults, setLookupResults] = useState<{ caseId: string; patientId: string; name: string; genderAge: string }[]>([]);
  const [patientInfo, setPatientInfo] = useState<{ genderAge: string; surgeryDate: string | null; diagnosisCode: string | null; procedureCode: string | null } | null>(null);

  const loadCaseDetail = async (caseId: string) => {
    if (!token) return;
    try {
      const detail = await patientService.getDetail(caseId, token);
      // Fill patient info
      // genderAge isn't in detail, but we can build it from sex + birth_year
      const age = detail.birth_year ? new Date().getFullYear() - detail.birth_year : null;
      setPatientInfo({
        genderAge: `${detail.sex || '-'} / ${age ?? '-'}`,
        surgeryDate: detail.surgery_date,
        diagnosisCode: detail.diagnosis_code,
        procedureCode: detail.procedure_code,
      });
      // Fill outcome form if exists
      const out = detail.outcome_form;
      if (out) {
        if (out.complication_yn != null) {
          // Parse complication_detail JSON for extended fields
          let ext: Record<string, unknown> = {};
          if (out.complication_detail) {
            try { ext = JSON.parse(out.complication_detail); } catch { /* plain text */ }
          }
          // Complications checkboxes
          if (Array.isArray(ext.complications)) {
            const compKeys = ext.complications as string[];
            setComplications({
              duralTear: compKeys.includes('duralTear'),
              nerveInjury: compKeys.includes('nerveInjury'),
              hematoma: compKeys.includes('hematoma'),
              ssiSuperficial: compKeys.includes('ssiSuperficial'),
              ssiDeep: compKeys.includes('ssiDeep'),
              nonUnion: compKeys.includes('nonUnion'),
              instrumentBreakage: compKeys.includes('instrumentBreakage'),
              instrumentDisplacement: compKeys.includes('instrumentDisplacement'),
              otherMedical: compKeys.includes('otherMedical'),
            });
          }
          if (ext.complication_severity) setSelectedSeverity(ext.complication_severity as string);
          if (ext.complication_date) setOccurrenceDate(ext.complication_date as string);
          if (ext.conversion_yn != null) setIsConversion(ext.conversion_yn as boolean);
          if (ext.conversion_reason) setConversionReason(ext.conversion_reason as string);
          if (ext.reoperation_date) setReoperationDate(ext.reoperation_date as string);
          // complication_detail as plain symptoms text (if not JSON or has 'text' key)
          if (typeof ext.text === 'string') setSymptoms(ext.text);
          else if (!ext.complications && typeof out.complication_detail === 'string') setSymptoms(out.complication_detail);
        }
        if (out.reoperation_yn != null) setIsReoperation(out.reoperation_yn);
      }
    } catch { /* detail load failed — form stays empty */ }
  };

  const handlePatientLookup = async () => {
    const keyword = [lookupId.trim(), lookupName.trim()].filter(Boolean).join(' ');
    if (!keyword) {
      setLookupMessage("환자 번호 또는 이름을 입력해주세요.");
      setSelectedCaseId(null);
      setLookupResults([]);
      return;
    }
    if (!token) return;
    setLookupLoading(true);
    setLookupMessage(null);
    setLookupResults([]);
    try {
      const res = await patientService.list({ keyword, page: 1, size: 10 }, token);
      if (res.items.length === 0) {
        setLookupMessage("일치하는 환자가 없습니다.");
        setSelectedCaseId(null);
      } else if (res.items.length === 1) {
        const p = res.items[0];
        setSelectedCaseId(p.caseId);
        setLookupName(p.name);
        setLookupId(p.id);
        setLookupMessage(`${p.name} (${p.id}) 선택됨`);
        loadCaseDetail(p.caseId);
      } else {
        setLookupResults(res.items.map(p => ({
          caseId: p.caseId, patientId: p.id,
          name: p.name, genderAge: p.genderAge,
        })));
        setLookupMessage(`${res.items.length}명의 환자가 검색되었습니다. 선택해주세요.`);
      }
    } catch (err) {
      setLookupMessage(err instanceof Error ? err.message : '환자 조회에 실패했습니다.');
      setSelectedCaseId(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleResetForm = () => {
    setLookupId("");
    setLookupName("");
    setSelectedCaseId(null);
    setLookupMessage(null);
    setLookupResults([]);
    setPatientInfo(null);
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
      if (err instanceof ApiValidationError) {
        const labelMap: Record<string, string> = {
          complications: '합병증 항목', complication_severity: '합병증 중증도',
          complication_date: '합병증 발생일', complication_detail: '상세 증상',
          complication_yn: '합병증 여부', conversion_yn: '수술 전환 여부',
          conversion_reason: '전환 사유', reoperation_yn: '재수술 여부',
          reoperation_date: '재수술 시행일', readmission_30d_yn: '30일 재입원',
          final_note: '최종 메모',
        };
        const fieldMap: Record<string, string> = {
          complication_date: 'occurrenceDate', complication_detail: 'symptoms',
          conversion_reason: 'conversionReason', reoperation_date: 'reoperationDate',
          complication_severity: 'severity',
        };
        const errorLabels: string[] = [];
        let firstDataField: string | null = null;
        for (const fe of err.fields) {
          const label = labelMap[fe.field] ?? fe.field;
          errorLabels.push(`${label} — ${translateValidationMsg(fe.message)}`);
          if (!firstDataField) firstDataField = fieldMap[fe.field] ?? null;
        }
        setSaveError(`다음 항목을 확인해주세요: ${errorLabels.join(', ')}`);
        if (firstDataField) {
          setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-field="${firstDataField}"]`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              if (el instanceof HTMLInputElement) el.focus();
            }
          }, 0);
        }
      } else {
        setSaveError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      }
    } finally {
      setSaving(false);
    }
  };

  const severityOptions = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];

  return (
    <div className="space-y-5">
      {/* Patient Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm p-5">
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-4">대상 환자 선택</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">환자 번호</label>
            <input
              type="text"
              placeholder="예: KSOR-250331-001"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePatientLookup()}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">이름 (Name)</label>
            <input
              type="text"
              placeholder="환자 이름"
              value={lookupName}
              onChange={(e) => setLookupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePatientLookup()}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handlePatientLookup}
              disabled={lookupLoading}
              className="px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {lookupLoading ? '조회 중…' : '환자 조회'}
            </button>
            {lookupMessage && (
              <span className={`text-sm ${selectedCaseId ? 'text-green-600' : 'text-red-600'}`}>{lookupMessage}</span>
            )}
          </div>
        </div>
        {/* Search results list */}
        {lookupResults.length > 0 && (
          <div className="mt-3 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            {lookupResults.map((p) => (
              <button
                key={p.caseId}
                onClick={() => {
                  setSelectedCaseId(p.caseId);
                  setLookupName(p.name);
                  setLookupId(p.patientId);
                  setLookupMessage(`${p.name} (${p.patientId}) 선택됨`);
                  setLookupResults([]);
                  loadCaseDetail(p.caseId);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-800 last:border-b-0 flex justify-between items-center ${
                  selectedCaseId === p.caseId ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>{p.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{p.patientId} · {p.genderAge}</span>

              </button>
            ))}
          </div>
        )}
      </div>

      {/* Patient Info Summary */}
      {selectedCaseId && patientInfo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">선택된 환자 정보</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><span className="text-blue-600">이름:</span> <span className="text-gray-900 dark:text-gray-100">{lookupName}</span></div>
            <div><span className="text-blue-600">성별/나이:</span> <span className="text-gray-900 dark:text-gray-100">{patientInfo.genderAge}</span></div>
            <div><span className="text-blue-600">수술일:</span> <span className="text-gray-900 dark:text-gray-100">{patientInfo.surgeryDate || '-'}</span></div>
            <div><span className="text-blue-600">진단:</span> <span className="text-gray-900 dark:text-gray-100">{patientInfo.diagnosisCode || '-'}</span></div>
          </div>
        </div>
      )}

      {/* Conversion + Reoperation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 수술 중 전환 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm p-6">
          <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">수술 중 전환 (Conversion to open)</h2>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setIsConversion(!isConversion)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isConversion ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  isConversion ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">개방형 전환 여부 (Is it a conversion?)</span>
          </div>
          <div>
            <input
              type="text"
              data-field="conversionReason"
              value={conversionReason}
              onChange={(e) => setConversionReason(e.target.value)}
              placeholder="전환 사유 (Reason for conversion)"
              disabled={!isConversion}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500"
            />
          </div>
        </div>

        {/* 재수술 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm p-6">
          <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">재수술 (Reoperation)</h2>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setIsReoperation(!isReoperation)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isReoperation ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  isReoperation ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">재수술 여부 (Is it a reoperation?)</span>
          </div>
          <div className="relative">
            <input
              type="date"
              max="9999-12-31"
              data-field="reoperationDate"
              value={reoperationDate}
              onChange={(e) => setReoperationDate(e.target.value)}
              disabled={!isReoperation}
              placeholder="재수술 시행일 (Date of Reoperation)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500"
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 합병증 세부 기록 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm p-6">
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">합병증 세부 기록</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* 신경계 합병증 */}
          <div>
            <h3 className="text-sm text-gray-800 dark:text-gray-200 mb-4">신경계 합병증 (Neurological)</h3>
            <div className="space-y-3">
              {[
                { key: "duralTear" as const, label: "Dural tear (신경막 손상)" },
                { key: "nerveInjury" as const, label: "신경 손상 (Nerve Injury)" },
                { key: "hematoma" as const, label: "수술 후 혈종 (Postoperative Hematoma)" },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      complications[item.key] ? "border-blue-600 bg-blue-600" : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400 dark:group-hover:border-gray-500"
                    }`}
                    onClick={() => toggleComp(item.key)}
                  >
                    {complications[item.key] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => toggleComp(item.key)}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 감염 및 치유 */}
          <div>
            <h3 className="text-sm text-gray-800 dark:text-gray-200 mb-4">감염 및 치유 (Infection &amp; Healing)</h3>
            <div className="space-y-3">
              {[
                { key: "ssiSuperficial" as const, label: "표층 수술 부위 감염 (Superficial SSI)" },
                { key: "ssiDeep" as const, label: "심부 수술 부위 감염 (Deep SSI)" },
                { key: "nonUnion" as const, label: "불유합 (Non-union)" },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      complications[item.key] ? "border-blue-600 bg-blue-600" : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400 dark:group-hover:border-gray-500"
                    }`}
                    onClick={() => toggleComp(item.key)}
                  >
                    {complications[item.key] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => toggleComp(item.key)}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 기기 관련 및 기타 */}
          <div>
            <h3 className="text-sm text-gray-800 dark:text-gray-200 mb-4">기기 관련 및 기타 (Hardware &amp; Other)</h3>
            <div className="space-y-3">
              {[
                { key: "instrumentBreakage" as const, label: "기기 파손 (Instrument Breakage)" },
                { key: "instrumentDisplacement" as const, label: "기기 전위 (Instrument Displacement)" },
                { key: "otherMedical" as const, label: "기타 내과적 합병증 (Other Medical)" },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      complications[item.key] ? "border-blue-600 bg-blue-600" : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400 dark:group-hover:border-gray-500"
                    }`}
                    onClick={() => toggleComp(item.key)}
                  >
                    {complications[item.key] && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => toggleComp(item.key)}>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 중증도 및 기록 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm p-6">
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">중증도 및 기록 (Severity &amp; Notes)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 합병증 발생일 */}
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">
              합병증 발생일 (Date of Occurrence)
            </label>
            <div className="relative">
              <input
                type="date"
                max="9999-12-31"
                data-field="occurrenceDate"
                value={occurrenceDate}
                onChange={(e) => setOccurrenceDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* 상세 증상 및 처치 */}
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">
              상세 증상 및 처치 (Detailed Symptoms &amp; Treatment)
            </label>
            <input
              type="text"
              data-field="symptoms"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="증상 및 처치 내용"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 합병증 중증도 */}
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">
              합병증 중증도 (Complication Severity)
            </label>
            <div className="relative">
              <button
                onClick={() => setSeverityOpen(!severity)}
                className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className={selectedSeverity ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}>
                  {selectedSeverity || "Grade 1, 2, 3, ..., Grade 1, ..."}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </button>
              {severity && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 overflow-hidden">
                  {severityOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setSelectedSeverity(opt); setSeverityOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        selectedSeverity === opt ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700" : "text-gray-700 dark:text-gray-300"
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
          className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          초기화
        </button>
        <button
          onClick={handleSaveComplication}
          disabled={saving}
          className="px-8 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-50 transition-colors disabled:opacity-50"
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
  const [patientCache, setPatientCache] = useState<PatientListCache | null>(null);

  const handleCacheUpdate = useCallback((c: PatientListCache) => {
    setPatientCache(c);
  }, []);

  const tabs: { key: TabType; label: string }[] = [
    { key: "list", label: "환자 목록" },
    { key: "complication", label: "합병증 및 재수술 기록" },
  ];

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl text-gray-900 dark:text-gray-100">KOMISS / KSOR Registry</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Patient Management &amp; Follow-up Tracker</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-1 w-fit shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm transition-colors ${
              activeTab === tab.key
                ? "bg-gray-900 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "list"
        ? <PatientListTab cache={patientCache} onCacheUpdate={handleCacheUpdate} />
        : <ComplicationTab />}
    </div>
  );
}
