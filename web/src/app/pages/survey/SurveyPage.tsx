import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '../../components/survey/Logo';
import { MobileFrame } from '../../components/survey/MobileFrame';
import { ProgressBar } from '../../components/survey/ProgressBar';
import { VASSlider } from '../../components/survey/VASSlider';
import { ChoiceCard } from '../../components/survey/ChoiceCard';
import { surveyQuestions, VASQuestion, ChoiceQuestion } from '../../data/questions';

type VASAnswer = { [sliderId: string]: number };
type ChoiceAnswer = number;
type Answer = VASAnswer | ChoiceAnswer;
type Answers = { [questionId: number]: Answer };

const TOTAL = surveyQuestions.length;

export default function SurveyQuestionsPage() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});

  const question = surveyQuestions[currentIndex];
  const questionNum = currentIndex + 1;

  function getVASAnswer(qId: number, sliderId: string): number {
    const ans = answers[qId];
    if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
      return (ans as VASAnswer)[sliderId] ?? 5;
    }
    return 5;
  }

  function getChoiceAnswer(qId: number): number | null {
    const ans = answers[qId];
    if (typeof ans === 'number') return ans;
    return null;
  }

  function setVASAnswer(qId: number, sliderId: string, value: number) {
    setAnswers((prev) => {
      const existing = (prev[qId] as VASAnswer) ?? {};
      return { ...prev, [qId]: { ...existing, [sliderId]: value } };
    });
  }

  function setChoiceAnswer(qId: number, value: number) {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  }

  function canProceed(): boolean {
    if (question.type === 'vas') {
      return true;
    } else {
      return getChoiceAnswer(question.id) !== null;
    }
  }

  function handleNext() {
    if (currentIndex < TOTAL - 1) {
      setCurrentIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/patient-survey/complete', { state: { answers } });
    }
  }

  function handlePrev() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/patient-survey');
    }
  }

  return (
    <MobileFrame>
      {/* Header */}
      <div
        style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: '#fff',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <Logo size="sm" />
        </div>
        <ProgressBar current={questionNum} total={TOTAL} />
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 20px 120px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Section badge */}
        <div
          style={{
            display: 'inline-block',
            backgroundColor: '#eff6ff',
            color: '#3b82f6',
            fontSize: '12px',
            fontWeight: '600',
            padding: '4px 10px',
            borderRadius: '20px',
            marginBottom: '14px',
            letterSpacing: '-0.1px',
          }}
        >
          {question.section}
        </div>

        {/* Question title (for choice) */}
        {question.type === 'choice' && (
          <div style={{ marginBottom: '16px' }}>
            <p
              style={{
                fontSize: '13px',
                color: '#6b7280',
                fontWeight: '500',
                marginBottom: '6px',
              }}
            >
              {(question as ChoiceQuestion).title}
            </p>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: '#111827',
                lineHeight: '1.5',
                whiteSpace: 'pre-line',
              }}
            >
              {(question as ChoiceQuestion).question}
            </h2>
          </div>
        )}

        {/* VAS sliders */}
        {question.type === 'vas' && (
          <div>
            {(question as VASQuestion).sliders.map((slider, idx) => (
              <div
                key={slider.id}
                style={{
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  padding: '18px 16px',
                  marginBottom: idx < (question as VASQuestion).sliders.length - 1 ? '16px' : '0',
                  border: '1px solid #e2e8f0',
                }}
              >
                <p
                  style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    fontWeight: '500',
                    marginBottom: '4px',
                  }}
                >
                  귀하의 현재 증상
                </p>
                <VASSlider
                  label={slider.label}
                  value={getVASAnswer(question.id, slider.id)}
                  onChange={(v) => setVASAnswer(question.id, slider.id, v)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Choice cards */}
        {question.type === 'choice' && (
          <div>
            {(question as ChoiceQuestion).options.map((opt) => (
              <ChoiceCard
                key={opt.value}
                option={opt}
                selected={getChoiceAnswer(question.id) === opt.value}
                onSelect={(v) => setChoiceAnswer(question.id, v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom navigation */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          borderTop: '1px solid #e5e7eb',
          padding: '14px 20px',
          display: 'flex',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handlePrev}
          style={{
            flex: 1,
            padding: '14px',
            borderRadius: '10px',
            border: '2px solid #e5e7eb',
            backgroundColor: '#fff',
            color: '#374151',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
        >
          이전
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed()}
          style={{
            flex: 2,
            padding: '14px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: canProceed() ? '#3b82f6' : '#d1d5db',
            color: canProceed() ? '#fff' : '#9ca3af',
            fontSize: '16px',
            fontWeight: '600',
            cursor: canProceed() ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.2s',
            boxShadow: canProceed() ? '0 2px 8px rgba(59, 130, 246, 0.35)' : 'none',
          }}
        >
          {currentIndex === TOTAL - 1 ? '제출하기' : '다음'}
        </button>
      </div>
    </MobileFrame>
  );
}
