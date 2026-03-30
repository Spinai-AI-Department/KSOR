import { ChoiceOption } from '@/utils/surveyQuestions';

interface ChoiceCardProps {
  option: ChoiceOption;
  selected: boolean;
  onSelect: (value: number) => void;
}

export function ChoiceCard({ option, selected, onSelect }: ChoiceCardProps) {
  return (
    <button
      onClick={() => onSelect(option.value)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: '10px',
        border: selected ? '2px solid #16a34a' : '2px solid #e2e8f0',
        backgroundColor: selected ? '#f0fdf4' : '#ffffff',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease',
        marginBottom: '10px',
      }}
    >
      {/* Check icon circle */}
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: selected ? '#16a34a' : '#e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background-color 0.15s ease',
        }}
      >
        {selected ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8L6.5 11.5L13 5"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8L6.5 11.5L13 5"
              stroke="#9ca3af"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: '15px',
            fontWeight: '600',
            color: selected ? '#15803d' : '#1f2937',
            marginBottom: '2px',
          }}
        >
          {option.title}
        </div>
        <div
          style={{
            fontSize: '13px',
            color: selected ? '#16a34a' : '#6b7280',
            lineHeight: '1.4',
          }}
        >
          {option.desc}
        </div>
      </div>
    </button>
  );
}
