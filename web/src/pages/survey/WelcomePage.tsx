import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Logo } from '@/components/survey/Logo';
import { MobileFrame } from '@/components/survey/MobileFrame';
import { surveyService } from '@/api/survey';

export default function SurveyWelcomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenUuid = searchParams.get('token') ?? '';

  const [step, setStep] = useState<'welcome' | 'verify'>('welcome');
  const [verifyMethod, setVerifyMethod] = useState<'birth_ymd' | 'phone_last4'>('birth_ymd');
  const [verifyValue, setVerifyValue] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenUuid) return;
    surveyService.getStatus(tokenUuid).then(status => {
      if (status.expired || status.token_status === 'EXPIRED') {
        setStatusError('설문 링크가 만료되었습니다.');
      } else if (status.submitted_at) {
        setStatusError('이미 제출된 설문입니다.');
      }
    }).catch(() => {
      // If getStatus fails, let user try to proceed
    });
  }, [tokenUuid]);

  const handleStartVerify = () => setStep('verify');

  const handleVerify = async () => {
    if (!tokenUuid || !verifyValue) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await surveyService.verify(tokenUuid, { method_code: verifyMethod, value: verifyValue });
      if (res.verified) {
        navigate(`/patient-survey/questions?token=${tokenUuid}&jwt=${res.survey_token}`);
      } else {
        setVerifyError('인증에 실패했습니다. 입력값을 확인해주세요.');
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : '인증 중 오류가 발생했습니다.');
    } finally {
      setVerifying(false);
    }
  };

  if (step === 'verify') {
    return (
      <MobileFrame>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '40px 28px 0',
          }}
        >
          <div style={{ marginBottom: '32px' }}>
            <Logo size="lg" />
          </div>

          <h1
            style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#1a202c',
              textAlign: 'center',
              lineHeight: '1.4',
              marginBottom: '12px',
            }}
          >
            본인 인증
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#4a5568',
              textAlign: 'center',
              lineHeight: '1.6',
              marginBottom: '32px',
            }}
          >
            설문을 시작하기 전에 본인 확인이 필요합니다.
          </p>

          {/* Method selection */}
          <div style={{ width: '100%', marginBottom: '20px' }}>
            <p style={{ fontSize: '13px', color: '#718096', marginBottom: '10px' }}>인증 방법 선택</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              {([
                { value: 'birth_ymd', label: '생년월일 8자리' },
                { value: 'phone_last4', label: '전화번호 뒤 4자리' },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#2d3748' }}
                >
                  <input
                    type="radio"
                    name="verifyMethod"
                    value={opt.value}
                    checked={verifyMethod === opt.value}
                    onChange={() => setVerifyMethod(opt.value)}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Input */}
          <input
            type={verifyMethod === 'birth_ymd' ? 'text' : 'text'}
            placeholder={verifyMethod === 'birth_ymd' ? '예: 19801225' : '예: 1234'}
            value={verifyValue}
            onChange={(e) => setVerifyValue(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1.5px solid #e2e8f0',
              fontSize: '16px',
              outline: 'none',
              marginBottom: '16px',
              boxSizing: 'border-box',
            }}
          />

          {verifyError && (
            <p style={{ fontSize: '13px', color: '#e53e3e', marginBottom: '12px', textAlign: 'center' }}>
              {verifyError}
            </p>
          )}

          <button
            onClick={handleVerify}
            disabled={verifying || !verifyValue}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              borderRadius: '12px',
              border: 'none',
              fontSize: '17px',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: verifying || !verifyValue ? 0.6 : 1,
              marginBottom: '12px',
            }}
          >
            {verifying ? '확인 중…' : '확인'}
          </button>

          <button
            onClick={() => setStep('welcome')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '14px',
              color: '#718096',
              cursor: 'pointer',
              padding: '8px',
            }}
          >
            돌아가기
          </button>
        </div>

        <div
          style={{
            padding: '24px 28px',
            textAlign: 'center',
            borderTop: '1px solid #f0f0f0',
            marginTop: 'auto',
          }}
        >
          <p style={{ fontSize: '12px', color: '#9ca3af' }}>
            KOMISS 및 KSOR 드림 | 문의: 02-xxx-xxxx
          </p>
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '40px 28px 0',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: '32px' }}>
          <Logo size="lg" />
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '26px',
            fontWeight: '700',
            color: '#1a202c',
            textAlign: 'center',
            lineHeight: '1.4',
            marginBottom: '20px',
          }}
        >
          척추 수술 후 관리 포털
          <br />
          <span style={{ color: '#1B4F8A' }}>(KOMISS x KSOR)</span>
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: '16px',
            color: '#4a5568',
            textAlign: 'center',
            lineHeight: '1.7',
            marginBottom: '40px',
          }}
        >
          안녕하십니까, 수술 후 회복을 돕기 위해
          <br />
          귀하의 건강 상태를 확인하고자 합니다.
          <br />
          아래 설문을 시작해 주세요.
        </p>

        {statusError && (
          <div
            style={{
              width: '100%',
              padding: '14px 16px',
              backgroundColor: '#fff5f5',
              border: '1px solid #feb2b2',
              borderRadius: '10px',
              fontSize: '14px',
              color: '#c53030',
              textAlign: 'center',
              marginBottom: '20px',
            }}
          >
            {statusError}
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={tokenUuid ? handleStartVerify : () => navigate('/patient-survey/questions')}
          disabled={!!statusError}
          style={{
            width: '100%',
            padding: '18px',
            backgroundColor: '#3b82f6',
            color: 'white',
            borderRadius: '12px',
            border: 'none',
            fontSize: '18px',
            fontWeight: '600',
            cursor: statusError ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.2px',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            opacity: statusError ? 0.5 : 1,
          }}
          onMouseDown={(e) => {
            if (!statusError) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          설문 시작하기
        </button>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '24px 28px',
          textAlign: 'center',
          borderTop: '1px solid #f0f0f0',
          marginTop: 'auto',
        }}
      >
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>
          KOMISS 및 KSOR 드림 | 문의: 02-xxx-xxxx
        </p>
      </div>
    </MobileFrame>
  );
}
