import { useState } from "react";
import {
  User,
  Mail,
  Phone,
  Building2,
  Stethoscope,
  BadgeCheck,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Tab = "info" | "password";

interface Toast {
  type: "success" | "error";
  message: string;
}

export function ProfilePage() {
  const { user, updateUser, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [toast, setToast] = useState<Toast | null>(null);

  // ── Info form state ──────────────────────────────────────
  const [infoForm, setInfoForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    hospital: user?.hospital ?? "",
    department: user?.department ?? "",
    role: user?.role ?? "",
    specialty: user?.specialty ?? "",
    licenseNumber: user?.licenseNumber ?? "",
  });
  const [infoLoading, setInfoLoading] = useState(false);

  // ── Password form state ──────────────────────────────────
  const [pwForm, setPwForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwLoading, setPwLoading] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleInfoChange = (field: string, value: string) => {
    setInfoForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoLoading(true);
    const result = await updateUser(infoForm);
    setInfoLoading(false);
    if (result.success) showToast("success", "프로필이 성공적으로 업데이트되었습니다.");
    else showToast("error", result.error ?? "업데이트에 실패했습니다.");
  };

  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      showToast("error", "새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwLoading(true);
    const result = await changePassword(pwForm.current, pwForm.next);
    setPwLoading(false);
    if (result.success) {
      showToast("success", "비밀번호가 변경되었습니다.");
      setPwForm({ current: "", next: "", confirm: "" });
    } else {
      showToast("error", result.error ?? "비밀번호 변경에 실패했습니다.");
    }
  };

  const avatarInitial = user?.name?.[0] ?? "?";

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm transition-all ${
            toast.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <span>설정</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-700">내 정보 수정</span>
          </div>
          <h1 className="text-2xl text-gray-900">내 정보 수정</h1>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-2xl">{avatarInitial}</span>
          </div>
          <div>
            <div className="text-lg text-gray-900">{user?.name}</div>
            <div className="text-sm text-gray-500 mt-0.5">{user?.role} · {user?.hospital}</div>
            <div className="text-xs text-gray-400 mt-0.5">{user?.email}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          {(["info", "password"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "info" ? "기본 정보" : "비밀번호 변경"}
            </button>
          ))}
        </div>

        {/* ── Tab: 기본 정보 ───────────────────────────────── */}
        {activeTab === "info" && (
          <form onSubmit={handleInfoSubmit}>
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
              {/* 개인 정보 */}
              <div className="p-6">
                <h2 className="text-sm text-gray-500 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" /> 개인 정보
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="이름"
                    value={infoForm.name}
                    onChange={(v) => handleInfoChange("name", v)}
                    placeholder="홍길동"
                  />
                  <Field
                    label="이메일"
                    type="email"
                    value={infoForm.email}
                    onChange={(v) => handleInfoChange("email", v)}
                    placeholder="example@ksor.kr"
                    icon={<Mail className="w-4 h-4" />}
                  />
                  <Field
                    label="연락처"
                    value={infoForm.phone}
                    onChange={(v) => handleInfoChange("phone", v)}
                    placeholder="010-0000-0000"
                    icon={<Phone className="w-4 h-4" />}
                  />
                </div>
              </div>

              {/* 소속 정보 */}
              <div className="p-6">
                <h2 className="text-sm text-gray-500 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> 소속 정보
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="소속 병원"
                    value={infoForm.hospital}
                    onChange={(v) => handleInfoChange("hospital", v)}
                    placeholder="○○대학교병원"
                  />
                  <Field
                    label="진료과"
                    value={infoForm.department}
                    onChange={(v) => handleInfoChange("department", v)}
                    placeholder="신경외과"
                  />
                  <Field
                    label="직책"
                    value={infoForm.role}
                    onChange={(v) => handleInfoChange("role", v)}
                    placeholder="신경외과 전문의"
                  />
                </div>
              </div>

              {/* 전문 정보 */}
              <div className="p-6">
                <h2 className="text-sm text-gray-500 mb-4 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4" /> 전문 정보
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="전문 분야"
                    value={infoForm.specialty}
                    onChange={(v) => handleInfoChange("specialty", v)}
                    placeholder="신경외과"
                  />
                  <Field
                    label="면허번호"
                    value={infoForm.licenseNumber}
                    onChange={(v) => handleInfoChange("licenseNumber", v)}
                    placeholder="12345"
                    icon={<BadgeCheck className="w-4 h-4" />}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={infoLoading}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {infoLoading ? (
                  <>
                    <Spinner /> 저장 중...
                  </>
                ) : (
                  "변경사항 저장"
                )}
              </button>
            </div>
          </form>
        )}

        {/* ── Tab: 비밀번호 변경 ────────────────────────────── */}
        {activeTab === "password" && (
          <form onSubmit={handlePwSubmit}>
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm text-gray-500 mb-5 flex items-center gap-2">
                <Lock className="w-4 h-4" /> 비밀번호 변경
              </h2>

              <div className="space-y-4 max-w-sm">
                <PwField
                  label="현재 비밀번호"
                  value={pwForm.current}
                  show={showPw.current}
                  onChange={(v) => setPwForm((p) => ({ ...p, current: v }))}
                  onToggle={() => setShowPw((s) => ({ ...s, current: !s.current }))}
                  placeholder="현재 비밀번호 입력"
                />
                <PwField
                  label="새 비밀번호"
                  value={pwForm.next}
                  show={showPw.next}
                  onChange={(v) => setPwForm((p) => ({ ...p, next: v }))}
                  onToggle={() => setShowPw((s) => ({ ...s, next: !s.next }))}
                  placeholder="6자 이상 입력"
                />
                <PwField
                  label="새 비밀번호 확인"
                  value={pwForm.confirm}
                  show={showPw.confirm}
                  onChange={(v) => setPwForm((p) => ({ ...p, confirm: v }))}
                  onToggle={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
                  placeholder="새 비밀번호 재입력"
                />

                {/* Strength hint */}
                {pwForm.next.length > 0 && (
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          pwForm.next.length >= i * 3
                            ? pwForm.next.length >= 12
                              ? "bg-green-500"
                              : pwForm.next.length >= 9
                              ? "bg-blue-500"
                              : pwForm.next.length >= 6
                              ? "bg-yellow-400"
                              : "bg-red-400"
                            : "bg-gray-200"
                        }`}
                      />
                    ))}
                    <span className="text-xs text-gray-400 w-14">
                      {pwForm.next.length >= 12
                        ? "매우 강함"
                        : pwForm.next.length >= 9
                        ? "강함"
                        : pwForm.next.length >= 6
                        ? "보통"
                        : "약함"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={pwLoading}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {pwLoading ? (
                  <>
                    <Spinner /> 변경 중...
                  </>
                ) : (
                  "비밀번호 변경"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${icon ? "pl-9" : "pl-3"} pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-gray-50`}
        />
      </div>
    </div>
  );
}

function PwField({
  label,
  value,
  show,
  onChange,
  onToggle,
  placeholder,
}: {
  label: string;
  value: string;
  show: boolean;
  onChange: (v: string) => void;
  onToggle: () => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-gray-50"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
