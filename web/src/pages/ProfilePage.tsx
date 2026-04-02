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
  ChevronRight,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme, type Theme } from "@/context/ThemeContext";

type Tab = "info" | "password" | "settings";

interface InlineMsg { type: "success" | "error"; message: string }

export function ProfilePage() {
  const { user, updateUser, changePassword } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [msg, setMsg] = useState<InlineMsg | null>(null);
  const [pwErrors, setPwErrors] = useState<Record<string, boolean>>({});
  const [pwErrorMsgs, setPwErrorMsgs] = useState<Record<string, string>>({});

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

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwLoading, setPwLoading] = useState(false);

  const handleInfoChange = (field: string, value: string) => {
    setInfoForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoLoading(true);
    const result = await updateUser(infoForm);
    setInfoLoading(false);
    if (result.success) setMsg({ type: "success", message: "프로필이 성공적으로 업데이트되었습니다." });
    else setMsg({ type: "error", message: result.error ?? "업데이트에 실패했습니다." });
  };

  const handlePwSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    const errorFlags: Record<string, boolean> = {};
    if (pwForm.next.length < 6) {
      errors['새 비밀번호'] = '6자 이상 입력해주세요.';
      errorFlags['next'] = true;
    }
    if (pwForm.next !== pwForm.confirm) {
      errors['새 비밀번호 확인'] = '새 비밀번호와 일치하지 않습니다.';
      errorFlags['confirm'] = true;
    }
    if (Object.keys(errors).length > 0) {
      setPwErrors(errorFlags);
      setPwErrorMsgs(errors);
      setTimeout(() => {
        const firstKey = Object.keys(errorFlags)[0];
        const el = document.querySelector<HTMLInputElement>(`[data-field="${firstKey}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
      }, 0);
      return;
    }
    setPwErrorMsgs({});
    setPwErrors({});
    setPwLoading(true);
    const result = await changePassword(pwForm.current, pwForm.next);
    setPwLoading(false);
    if (result.success) {
      setMsg({ type: "success", message: "비밀번호가 변경되었습니다." });
      setPwForm({ current: "", next: "", confirm: "" });
    } else {
      setMsg({ type: "error", message: result.error ?? "비밀번호 변경에 실패했습니다." });
    }
  };

  const avatarInitial = user?.name?.[0] ?? "?";

  const themeOptions: { value: Theme; label: string; icon: React.ReactNode; desc: string }[] = [
    { value: "light", label: "라이트", icon: <Sun className="w-5 h-5" />, desc: "항상 밝은 화면" },
    { value: "dark", label: "다크", icon: <Moon className="w-5 h-5" />, desc: "항상 어두운 화면" },
    { value: "system", label: "시스템", icon: <Monitor className="w-5 h-5" />, desc: "기기 설정에 따름" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8">
      {msg && (
        <div className={`mb-4 p-4 rounded-lg text-sm border ${msg.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-400'}`}>
          {msg.message}
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 mb-1">
            <span>설정</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-700 dark:text-gray-300">내 정보 수정</span>
          </div>
          <h1 className="text-2xl text-gray-900 dark:text-gray-100">내 정보 수정</h1>
        </div>

        {/* Profile Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 p-6 mb-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-gray-900 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-2xl">{avatarInitial}</span>
          </div>
          <div>
            <div className="text-lg text-gray-900 dark:text-gray-100">{user?.name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user?.role} · {user?.hospital}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{user?.email}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          {(["info", "password", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {tab === "info" ? "기본 정보" : tab === "password" ? "비밀번호 변경" : "설정"}
            </button>
          ))}
        </div>

        {/* ── Tab: 기본 정보 ─────────────────────────────────── */}
        {activeTab === "info" && (
          <form onSubmit={handleInfoSubmit}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-600">
              {/* 개인 정보 */}
              <div className="p-6">
                <h2 className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" /> 개인 정보
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="이름" value={infoForm.name} onChange={(v) => handleInfoChange("name", v)} placeholder="홍길동" readOnly />
                  <Field label="이메일" type="email" value={infoForm.email} onChange={(v) => handleInfoChange("email", v)} placeholder="example@ksor.kr" icon={<Mail className="w-4 h-4" />} />
                  <Field label="연락처" value={infoForm.phone} onChange={(v) => handleInfoChange("phone", v)} placeholder="010-0000-0000" icon={<Phone className="w-4 h-4" />} />
                </div>
              </div>

              {/* 소속 정보 */}
              <div className="p-6">
                <h2 className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> 소속 정보
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="소속 병원" value={infoForm.hospital} onChange={(v) => handleInfoChange("hospital", v)} placeholder="○○대학교병원" readOnly />
                  <Field label="진료과" value={infoForm.department} onChange={(v) => handleInfoChange("department", v)} placeholder="신경외과" readOnly />
                  <Field label="직책" value={infoForm.role} onChange={(v) => handleInfoChange("role", v)} placeholder="신경외과 전문의" readOnly />
                </div>
              </div>

              {/* 전문 정보 */}
              <div className="p-6">
                <h2 className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4" /> 전문 정보
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="전문 분야" value={infoForm.specialty} onChange={(v) => handleInfoChange("specialty", v)} placeholder="척추" readOnly />
                  <Field label="면허번호" value={infoForm.licenseNumber} onChange={(v) => handleInfoChange("licenseNumber", v)} placeholder="12345" icon={<BadgeCheck className="w-4 h-4" />} readOnly />
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={infoLoading}
                className="px-6 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {infoLoading ? <><Spinner /> 저장 중...</> : "변경사항 저장"}
              </button>
            </div>
          </form>
        )}

        {/* ── Tab: 비밀번호 변경 ──────────────────────────────── */}
        {activeTab === "password" && (
          <form onSubmit={handlePwSubmit}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 p-6">
              <h2 className="text-sm text-gray-500 dark:text-gray-400 mb-5 flex items-center gap-2">
                <Lock className="w-4 h-4" /> 비밀번호 변경
              </h2>

              <div className="space-y-4 max-w-sm">
                <PwField label="현재 비밀번호" value={pwForm.current} show={showPw.current} onChange={(v) => setPwForm((p) => ({ ...p, current: v }))} onToggle={() => setShowPw((s) => ({ ...s, current: !s.current }))} placeholder="현재 비밀번호 입력" />
                <PwField label="새 비밀번호" fieldKey="next" value={pwForm.next} show={showPw.next} onChange={(v) => { setPwForm((p) => ({ ...p, next: v })); setPwErrors((prev) => ({ ...prev, next: false })); setPwErrorMsgs((prev) => { const { '새 비밀번호': _, ...rest } = prev; return rest; }); }} onToggle={() => setShowPw((s) => ({ ...s, next: !s.next }))} placeholder="6자 이상 입력" error={pwErrors['next']} errorMsg={pwErrorMsgs['새 비밀번호']} />
                <PwField label="새 비밀번호 확인" fieldKey="confirm" value={pwForm.confirm} show={showPw.confirm} onChange={(v) => { setPwForm((p) => ({ ...p, confirm: v })); setPwErrors((prev) => ({ ...prev, confirm: false })); setPwErrorMsgs((prev) => { const { '새 비밀번호 확인': _, ...rest } = prev; return rest; }); }} onToggle={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))} placeholder="새 비밀번호 재입력" error={pwErrors['confirm']} errorMsg={pwErrorMsgs['새 비밀번호 확인']} />

                {pwForm.next.length > 0 && (
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          pwForm.next.length >= i * 3
                            ? pwForm.next.length >= 12 ? "bg-green-500" : pwForm.next.length >= 9 ? "bg-blue-500" : pwForm.next.length >= 6 ? "bg-yellow-400" : "bg-red-400"
                            : "bg-gray-200 dark:bg-gray-700"
                        }`}
                      />
                    ))}
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-14">
                      {pwForm.next.length >= 12 ? "매우 강함" : pwForm.next.length >= 9 ? "강함" : pwForm.next.length >= 6 ? "보통" : "약함"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                disabled={pwLoading}
                className="px-6 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {pwLoading ? <><Spinner /> 변경 중...</> : "비밀번호 변경"}
              </button>
            </div>
          </form>
        )}

        {/* ── Tab: 설정 ──────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 p-6">
            <h2 className="text-sm text-gray-500 dark:text-gray-400 mb-5 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> 화면 모드
            </h2>
            <div className="grid grid-cols-3 gap-3 max-w-sm">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                    theme === opt.value
                      ? "border-gray-900 dark:border-gray-400 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {opt.icon}
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-center leading-tight text-gray-400 dark:text-gray-500">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = "text", icon, readOnly = false,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; icon?: React.ReactNode; readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`w-full ${icon ? "pl-9" : "pl-3"} pr-3 py-2.5 border rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none ${
            readOnly
              ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed border-gray-200 dark:border-gray-600"
              : "focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
          }`}
        />
      </div>
    </div>
  );
}

function PwField({
  label, fieldKey, value, show, onChange, onToggle, placeholder, error = false, errorMsg,
}: {
  label: string; fieldKey?: string; value: string; show: boolean; onChange: (v: string) => void; onToggle: () => void; placeholder?: string; error?: boolean; errorMsg?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input
          type={show ? "text" : "password"}
          data-field={fieldKey}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent bg-gray-50 dark:bg-gray-700 ${error ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200 dark:border-gray-600'}`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {errorMsg && <p className="text-xs text-red-500 mt-1">{errorMsg}</p>}
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
