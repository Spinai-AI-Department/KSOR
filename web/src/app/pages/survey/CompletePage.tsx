import { useNavigate } from 'react-router';
import { Logo } from '../../components/survey/Logo';
import { MobileFrame } from '../../components/survey/MobileFrame';

export default function SurveyCompletePage() {
  const navigate = useNavigate();

  return (
    <MobileFrame>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 28px',
          textAlign: 'center',
        }}
      >
        {/* Success icon */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: '#dcfce7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path
              d="M8 20L16 28L32 12"
              stroke="#16a34a"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <Logo size="sm" />

        <h1
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            marginTop: '24px',
            marginBottom: '16px',
          }}
        >
          설문이 완료되었습니다!
        </h1>

        <p
          style={{
            fontSize: '15px',
            color: '#6b7280',
            lineHeight: '1.7',
            marginBottom: '40px',
          }}
        >
          소중한 응답 감사드립니다.
          <br />
          귀하의 답변은 안전하게 저장되었으며,
          <br />
          담당 의료진이 확인할 예정입니다.
        </p>

        {/* Info card */}
        <div
          style={{
            width: '100%',
            backgroundColor: '#eff6ff',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '32px',
            border: '1px solid #bfdbfe',
          }}
        >
          <p style={{ fontSize: '13px', color: '#1d4ed8', lineHeight: '1.6', margin: 0 }}>
            📅 다음 설문은 일정에 따라 카카오 알림톡으로 자동 발송됩니다.
            <br />
            <span style={{ marginTop: '4px', display: 'block', fontWeight: '500' }}>
              수술 후: 1개월 → 3개월 → 6개월 → 1년
            </span>
          </p>
        </div>

        <button
          onClick={() => navigate('/patient-survey')}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            fontSize: '16px',
            fontWeight: '600',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
          }}
        >
          처음으로 돌아가기
        </button>
      </div>

      <div
        style={{
          padding: '16px 28px',
          textAlign: 'center',
          borderTop: '1px solid #f0f0f0',
        }}
      >
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>
          KOMISS 및 KSOR 드림 | 문의: 02-xxx-xxxx
        </p>
      </div>
    </MobileFrame>
  );
}
