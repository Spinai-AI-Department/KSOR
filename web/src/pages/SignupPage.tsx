import { useState, useEffect } from "react";
import { Link } from "react-router";
import { AlertCircle, CheckCircle } from "lucide-react";
import { authService } from "@/api/auth";
import type { Hospital } from "@/api/auth";
import logoImage from "@/assets/logo.png";

const ROLE_OPTIONS = [
  { value: "PI", label: "연구책임자 (PI)" },
  { value: "CRC", label: "임상연구코디네이터 (CRC)" },
];

export function SignupPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [form, setForm] = useState({
    login_id: "",
    password: "",
    password_confirm: "",
    full_name: "",
    email: "",
    phone: "",
    hospital_code: "",
    role_code: "PI",
    department: "",
    specialty: "",
    license_number: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    authService.getHospitals().catch(() => []).then((list) => {
      if (Array.isArray(list)) setHospitals(list);
    });
  }, []);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password_confirm) {
      setError("비밀번호 확인 값이 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await authService.signup({
        login_id: form.login_id,
        password: form.password,
        password_confirm: form.password_confirm,
        full_name: form.full_name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        hospital_code: form.hospital_code || undefined,
        role_code: form.role_code,
        department: form.department || undefined,
        specialty: form.specialty || undefined,
        license_number: form.license_number || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-900 dark:bg-gray-950 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <img src={logoImage} alt="KOMISS Logo" className="w-12 h-12" />
          <div>
            <div className="text-white text-sm">KOMISS / KSOR</div>
            <div className="text-gray-400 dark:text-gray-500 text-xs">Korean Neurosurgery Outcomes Registry</div>
          </div>
        </div>
        <div>
          <h1 className="text-white text-4xl mb-4 leading-tight">
            신경외과 수술 성과<br />데이터 레지스트리
          </h1>
          <p className="text-gray-400 dark:text-gray-500 text-base leading-relaxed">
            국내 최초 신경외과 내시경 수술 전문 레지스트리 시스템으로<br />
            체계적인 수술 성과 추적 및 분석을 지원합니다.
          </p>
        </div>
        <div className="text-gray-600 text-xs">© 2024 KOMISS / KSOR. All rights reserved.</div>
      </div>

      {/* Right Panel — Signup Form */}
      <div className="flex-1 flex items-start justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src={logoImage} alt="KOMISS Logo" className="w-10 h-10" />
            <div>
              <div className="text-gray-900 dark:text-gray-100 text-sm">KOMISS / KSOR</div>
              <div className="text-gray-400 dark:text-gray-500 text-xs">Korean Neurosurgery Outcomes Registry</div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl text-gray-900 dark:text-gray-100 mb-1">회원가입</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">관리자 승인 후 로그인할 수 있습니다.</p>
          </div>

          {success ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <CheckCircle className="w-14 h-14 text-green-500" />
              <div>
                <p className="text-lg text-gray-900 dark:text-gray-100 mb-1">신청이 완료되었습니다</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">관리자 승인 후 로그인할 수 있습니다.</p>
              </div>
              <Link to="/login" className="mt-4 text-sm text-gray-900 dark:text-gray-100 underline">
                로그인 페이지로 이동
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">아이디 <span className="text-red-500">*</span></label>
                  <input required value={form.login_id} onChange={set("login_id")} placeholder="영문, 숫자 3자 이상" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">비밀번호 <span className="text-red-500">*</span></label>
                  <input required type="password" value={form.password} onChange={set("password")} placeholder="8자 이상" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">비밀번호 확인 <span className="text-red-500">*</span></label>
                  <input required type="password" value={form.password_confirm} onChange={set("password_confirm")} placeholder="비밀번호 재입력" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">이름 <span className="text-red-500">*</span></label>
                  <input required value={form.full_name} onChange={set("full_name")} placeholder="실명" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">이메일</label>
                  <input type="email" value={form.email} onChange={set("email")} placeholder="example@hospital.kr" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">전화번호</label>
                  <input value={form.phone} onChange={set("phone")} placeholder="010-0000-0000" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">소속 병원 <span className="text-red-500">*</span></label>
                  <select required value={form.hospital_code} onChange={set("hospital_code")} className={inputCls}>
                    <option value="">병원을 선택하세요</option>
                    {hospitals.map((h) => (
                      <option key={h.hospital_code} value={h.hospital_code}>{h.hospital_name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">역할 <span className="text-red-500">*</span></label>
                  <select required value={form.role_code} onChange={set("role_code")} className={inputCls}>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">진료과</label>
                  <input value={form.department} onChange={set("department")} placeholder="신경외과" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">전문분야</label>
                  <input value={form.specialty} onChange={set("specialty")} placeholder="척추" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">면허번호</label>
                  <input value={form.license_number} onChange={set("license_number")} placeholder="의사면허번호" className={inputCls} />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    신청 중...
                  </>
                ) : "회원가입 신청"}
              </button>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                이미 계정이 있으신가요?{" "}
                <Link to="/login" className="text-gray-900 dark:text-gray-100 underline">로그인</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
