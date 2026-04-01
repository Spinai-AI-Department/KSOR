import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Lock, Mail, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import logoImage from "@/assets/logo.png";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!email) errors['이메일'] = '이메일을 입력해주세요.';
    if (!password) errors['비밀번호'] = '비밀번호를 입력해주세요.';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Focus the first error field
      const firstKey = Object.keys(errors)[0];
      const el = document.querySelector<HTMLInputElement>(`[data-field="${firstKey}"]`);
      el?.focus();
      return;
    }
    setFieldErrors({});
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate("/");
    } else {
      setError(result.error ?? "로그인에 실패했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-900 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <img src={logoImage} alt="KOMISS Logo" className="w-12 h-12" />
          <div>
            <div className="text-white text-sm">KOMISS / KSOR</div>
            <div className="text-gray-400 text-xs">Korean Neurosurgery Outcomes Registry</div>
          </div>
        </div>

        <div>
          <h1 className="text-white text-4xl mb-4 leading-tight">
            신경외과 수술 성과<br />데이터 레지스트리
          </h1>
          <p className="text-gray-400 text-base leading-relaxed">
            국내 최초 신경외과 내시경 수술 전문 레지스트리 시스템으로<br />
            체계적인 수술 성과 추적 및 분석을 지원합니다.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-6">
            {[
              { value: "2,400+", label: "등록 환자" },
              { value: "12", label: "참여 병원" },
              { value: "98%", label: "데이터 정확도" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-white text-2xl">{stat.value}</div>
                <div className="text-gray-400 text-sm mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-gray-600 text-xs">
          © 2024 KOMISS / KSOR. All rights reserved.
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src={logoImage} alt="KOMISS Logo" className="w-10 h-10" />
            <div>
              <div className="text-gray-900 text-sm">KOMISS / KSOR</div>
              <div className="text-gray-400 text-xs">Korean Neurosurgery Outcomes Registry</div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl text-gray-900 mb-1">로그인</h2>
            <p className="text-gray-500 text-sm">KSOR 대시보드에 접속하려면 로그인하세요.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">이메일</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  data-field="이메일"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => { const { '이메일': _, ...rest } = prev; return rest; }); }}
                  placeholder="example@ksor.kr"
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${fieldErrors['이메일'] ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                />
              </div>
              {fieldErrors['이메일'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['이메일']}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">비밀번호</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  data-field="비밀번호"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((prev) => { const { '비밀번호': _, ...rest } = prev; return rest; }); }}
                  placeholder="비밀번호를 입력하세요"
                  className={`w-full pl-10 pr-10 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${fieldErrors['비밀번호'] ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors['비밀번호'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['비밀번호']}</p>}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  로그인 중...
                </>
              ) : (
                "로그인"
              )}
            </button>
          </form>

          {/* Demo Account */}
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-xs text-gray-500 mb-3">데모 계정으로 빠르게 접속하기</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setEmail("admin@ksor.kr"); setPassword("Admin1234!"); setError(""); setFieldErrors({}); }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-white transition-colors"
              >
                관리자 (ADMIN)
              </button>
              <button
                type="button"
                onClick={() => { setEmail("doctor@ksor.kr"); setPassword("Doctor123!"); setError(""); setFieldErrors({}); }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-white transition-colors"
              >
                연구책임자 (PI)
              </button>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
