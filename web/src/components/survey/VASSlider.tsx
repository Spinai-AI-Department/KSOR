interface VASSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

export function VASSlider({ label, value, onChange }: VASSliderProps) {
  const percentage = (value / 10) * 100;
  // Calculate thumb offset: at 0% → -12px offset, at 100% → +12px offset
  const thumbOffset = (percentage / 100) * 24 - 12;
  const labelLeft = `calc(${percentage}% - ${thumbOffset}px)`;

  return (
    <div className="mb-6">
      <p style={{ fontSize: '15px', color: '#222', marginBottom: '20px', lineHeight: '1.5' }}>
        {label}
      </p>

      {/* Value bubble above thumb */}
      <div className="relative" style={{ height: '30px' }}>
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: labelLeft,
            transform: 'translateX(-50%)',
            top: 0,
            minWidth: '32px',
          }}
        >
          <span
            style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#222',
              lineHeight: 1,
            }}
          >
            {value}
          </span>
        </div>
      </div>

      {/* Slider track */}
      <div className="relative" style={{ paddingBottom: '6px' }}>
        <style>{`
          .vas-range {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 12px;
            border-radius: 6px;
            outline: none;
            cursor: pointer;
            background: linear-gradient(to right, #22c55e 0%, #a3e635 25%, #facc15 50%, #f97316 75%, #ef4444 100%);
          }
          .vas-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
          }
          .vas-range::-moz-range-thumb {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
          }
          .vas-range::-webkit-slider-runnable-track {
            border-radius: 6px;
          }
          .vas-range::-moz-range-track {
            height: 12px;
            border-radius: 6px;
            background: linear-gradient(to right, #22c55e 0%, #a3e635 25%, #facc15 50%, #f97316 75%, #ef4444 100%);
          }
        `}</style>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="vas-range"
        />
      </div>

      {/* Labels */}
      <div
        className="flex justify-between"
        style={{ marginTop: '6px' }}
      >
        <div style={{ fontSize: '12px', color: '#666', textAlign: 'left' }}>
          <span style={{ fontWeight: '600' }}>0</span>
          <br />
          <span>(통증 없음)</span>
        </div>
        <div style={{ fontSize: '12px', color: '#666', textAlign: 'right' }}>
          <span style={{ fontWeight: '600' }}>10</span>
          <br />
          <span>(최악의 통증)</span>
        </div>
      </div>
    </div>
  );
}
