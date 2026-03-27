import { useNavigate } from 'react-router';
import { Logo } from '../../components/survey/Logo';
import { MobileFrame } from '../../components/survey/MobileFrame';

export default function SurveyWelcomePage() {
  const navigate = useNavigate();

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

        {/* Start Button */}
        <button
          onClick={() => navigate('/patient-survey/questions')}
          style={{
            width: '100%',
            padding: '18px',
            backgroundColor: '#3b82f6',
            color: 'white',
            borderRadius: '12px',
            border: 'none',
            fontSize: '18px',
            fontWeight: '600',
            cursor: 'pointer',
            letterSpacing: '-0.2px',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
          }}
          onMouseDown={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)';
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
