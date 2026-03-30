import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const devices = ["Joimax", "RIWOspine", "Stryker", "Endovision"];

const approachOptions = ["Full-endo", "UBE", "Biportal", "Open"] as const;
type Approach = (typeof approachOptions)[number];

const procedureTypes = [
  "감압술 (Decompression)",
  "유합술 (Fusion)",
  "디스크 치환술 (Disc Replacement)",
  "기타 (Other)",
];

const primaryDiagnosisOptions = [
  "추간판 탈출증 (HNP)",
  "척추관 협착증 (Stenosis)",
  "척추전방전위증 (Spondylolisthesis)",
  "퇴행성 디스크 질환 (DDD)",
  "기타 (Other)",
];

const compTypeOptions = [
  "경막 파열 (Dural Tear)",
  "신경 손상 (Nerve Injury)",
  "혈관 손상 (Vascular Injury)",
  "기타 (Other)",
];

const reoperationReasonOptions = [
  "재발 (Recurrence)",
  "감염 (Infection)",
  "혈종 (Hematoma)",
  "인접 분절 질환 (Adjacent Segment Disease)",
  "기타 (Other)",
];

const scopeAngles = ["0°", "30°", "70°"];

// ── Tooltip ──────────────────────────────────────────────────────────────────
function FieldLabel({
  label,
  sub,
  note,
  ksor,
  badge,
}: {
  label: string;
  sub?: string;
  note?: string;
  ksor?: "Core" | "Optional";
  badge?: "KSOR KEY" | "KSOR UNIQUE";
}) {
  return (
    <div className="relative group mb-1.5 w-fit">
      <div className="flex items-center gap-1.5 cursor-default">
        <span className="text-sm text-gray-700">{label}</span>
        {ksor === "Core" && (
          <span className="text-[10px] font-medium text-blue-500 border border-blue-200 bg-blue-50 rounded px-1 py-0.5 leading-none">Core</span>
        )}
        {ksor === "Optional" && (
          <span className="text-[10px] font-medium text-gray-400 border border-gray-200 bg-gray-50 rounded px-1 py-0.5 leading-none">Optional</span>
        )}
        {badge && (
          <span className="text-xs font-medium text-orange-500">{badge}</span>
        )}
        <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${note ? "text-gray-300 group-hover:text-gray-500" : "opacity-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <span className="block text-xs text-gray-400 mt-0.5">{sub || "\u00A0"}</span>

      {note && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-xl leading-relaxed">
          <span className="text-gray-400 font-medium uppercase tracking-wide text-[10px]">Note</span>
          <p className="mt-0.5">{note}</p>
          <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────
const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const sectionCls = "bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5";

function RadioGroup({
  value,
  onChange,
}: {
  value: "yes" | "no" | "";
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <div className="flex gap-4 mt-1">
      {(["yes", "no"] as const).map((v) => (
        <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <div
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${value === v ? "border-blue-600" : "border-gray-300"}`}
            onClick={() => onChange(v)}
          >
            {value === v && <div className="w-2 h-2 rounded-full bg-blue-600" />}
          </div>
          {v === "yes" ? "예" : "아니오"}
        </label>
      ))}
    </div>
  );
}

function Dropdown({
  open,
  setOpen,
  value,
  setValue,
  options,
  placeholder,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  value: string;
  setValue: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{value || placeholder}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { setValue(opt); setOpen(false); }}
              className={`w-full text-left px-4 py-3 text-sm hover:bg-blue-50 transition-colors ${value === opt ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function SurgeryDataEntry() {
  // Endoscopic
  const [selectedApproach, setSelectedApproach] = useState<Approach>("UBE");
  const [selectedTechnique, setSelectedTechnique] = useState("interlaminar");
  const [selectedLaterality, setSelectedLaterality] = useState("unilateral");
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [scopeAngle, setScopeAngle] = useState("");
  const [vizQuality, setVizQuality] = useState("");

  // Surgery dropdowns
  const [procedureOpen, setProcedureOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState("");
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);

  // Implant / conversion
  const [implants, setImplants] = useState({ cage: false, screws: false, none: false });
  const [conversion, setConversion] = useState<"yes" | "no" | "">("");

  // Demographics
  const [patientId, setPatientId] = useState("");
  const [surgeryDate, setSurgeryDate] = useState("");
  const [surgeon, setSurgeon] = useState("");
  const [asaClass, setAsaClass] = useState("");

  // Diagnosis
  const [diagnosis, setDiagnosis] = useState("");
  const [diagnosisLevel, setDiagnosisLevel] = useState("");
  const [myelopathy, setMyelopathy] = useState<"yes" | "no" | "">("");

  // Surgery
  const [opLevel, setOpLevel] = useState("");
  const [numLevels, setNumLevels] = useState("");
  const [opTime, setOpTime] = useState("");
  const [bloodLoss, setBloodLoss] = useState("");
  const [hospitalDays, setHospitalDays] = useState("");
  const [surgeonExp, setSurgeonExp] = useState("");
  const [antibioticProphylaxis, setAntibioticProphylaxis] = useState<"yes" | "no" | "">("");

  // Comorbidities
  const [diabetes, setDiabetes] = useState<"yes" | "no" | "">("");
  const [cardiovascular, setCardiovascular] = useState<"yes" | "no" | "">("");
  const [neurological, setNeurological] = useState<"yes" | "no" | "">("");
  const [depressionAnxiety, setDepressionAnxiety] = useState<"yes" | "no" | "">("");
  const [prevSpineSurgery, setPrevSpineSurgery] = useState<"yes" | "no" | "">("");

  // Complications
  const [intraoopComp, setIntraoopComp] = useState<"yes" | "no" | "">("");
  const [compTypeOpen, setCompTypeOpen] = useState(false);
  const [compType, setCompType] = useState("");
  const [reoperation, setReoperation] = useState<"yes" | "no" | "">("");
  const [reoperationReasonOpen, setReoperationReasonOpen] = useState(false);
  const [reoperationReason, setReoperationReason] = useState("");
  const [readmission30, setReadmission30] = useState<"yes" | "no" | "">("");

  // Comorbidities extra
  const [cci, setCci] = useState("");

  // Follow-up
  const [followupTimepoints, setFollowupTimepoints] = useState<string[]>([]);

  const toggleImplant = (key: keyof typeof implants) => {
    if (key === "none") {
      setImplants({ cage: false, screws: false, none: !implants.none });
    } else {
      setImplants((prev) => ({ ...prev, none: false, [key]: !prev[key] }));
    }
  };

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl text-gray-900">KSOR 수술 정보 입력</h1>
        <p className="text-gray-500 mt-1">Korean Spine Outcomes Registry — Surgery Data Entry</p>
      </div>

      {/* ── Demographics ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Demographics</p>
        <h2 className="text-base text-gray-900 mb-5">환자 기본 정보</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <FieldLabel label="Patient ID" />
            <input type="text" value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="예: 201933070" className={inputCls} />
          </div>
          <div>
            <FieldLabel label="수술일 (Surgery Date)" ksor="Core" />
            <input type="date" value={surgeryDate} onChange={(e) => setSurgeryDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <FieldLabel label="집도의 (Surgeon)" />
            <input type="text" value={surgeon} onChange={(e) => setSurgeon(e.target.value)} placeholder="집도의 이름" className={inputCls} />
          </div>
          <div>
            <FieldLabel
              label="ASA 분류 (ASA Class)"
              ksor="Core"
              note="Morbidity classification; SweSpine validation recommended improvement"
            />
            <select value={asaClass} onChange={(e) => setAsaClass(e.target.value)} className={`${inputCls} bg-white`}>
              <option value="">선택</option>
              {["I", "II", "III", "IV", "V"].map((c) => (
                <option key={c} value={c}>ASA {c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Comorbidities ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Comorbidities</p>
        <h2 className="text-base text-gray-900 mb-5">동반 질환</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          <div>
            <FieldLabel label="당뇨병" sub="Diabetes" ksor="Core" note="Most commonly collected comorbidity across registries" />
            <RadioGroup value={diabetes} onChange={setDiabetes} />
          </div>
          <div>
            <FieldLabel label="우울/불안장애" sub="Depression / Anxiety" ksor="Core" note="Strong outcome predictor" />
            <RadioGroup value={depressionAnxiety} onChange={setDepressionAnxiety} />
          </div>
          <div>
            <FieldLabel label="이전 척추 수술력" sub="Previous Spine Surgery" ksor="Core" note="Key predictor; revision vs primary" />
            <RadioGroup value={prevSpineSurgery} onChange={setPrevSpineSurgery} />
          </div>
          <div>
            <FieldLabel label="심혈관 질환" sub="Cardiovascular Disease" ksor="Optional" />
            <RadioGroup value={cardiovascular} onChange={setCardiovascular} />
          </div>
          <div>
            <FieldLabel label="신경계 질환" sub="Neurological Disease" ksor="Optional" />
            <RadioGroup value={neurological} onChange={setNeurological} />
          </div>
          <div>
            <FieldLabel label="동반 질환 지수 (CCI)" sub="Comorbidity Index" ksor="Optional" note="BSR and CSORN use CCI; consider for Phase 2" />
            <input type="number" value={cci} onChange={(e) => setCci(e.target.value)} min="0" placeholder="점수 입력" className={inputCls} />
          </div>
        </div>
      </div>

      {/* ── Diagnosis ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Diagnosis</p>
        <h2 className="text-base text-gray-900 mb-5">진단</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <FieldLabel label="진단명 (Primary Diagnosis)" ksor="Core" note="HNP, Stenosis, Spondylolisthesis, DDD, etc." />
            <Dropdown
              open={diagnosisOpen}
              setOpen={setDiagnosisOpen}
              value={diagnosis}
              setValue={setDiagnosis}
              options={primaryDiagnosisOptions}
              placeholder="진단명 선택"
            />
          </div>
          <div>
            <FieldLabel label="진단 레벨 (Diagnosis Level)" ksor="Core" note="Specific spinal level(s)" />
            <input type="text" value={diagnosisLevel} onChange={(e) => setDiagnosisLevel(e.target.value)} placeholder="예: L4-L5" className={inputCls} />
          </div>
          <div>
            <FieldLabel label="척수병증 (Myelopathy)" ksor="Core" note="Essential for cervical cases" />
            <RadioGroup value={myelopathy} onChange={setMyelopathy} />
          </div>
        </div>
      </div>

      {/* ── Surgery ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Surgery</p>
        <h2 className="text-base text-gray-900 mb-5">수술 정보</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <FieldLabel label="수술 방법 (Procedure Type)" ksor="Core" note="Decompression, fusion, disc replacement, etc." />
            <Dropdown
              open={procedureOpen}
              setOpen={setProcedureOpen}
              value={selectedProcedure}
              setValue={setSelectedProcedure}
              options={procedureTypes}
              placeholder="수술 방법 선택"
            />
          </div>
          <div>
            <FieldLabel label="수술 레벨 (Surgical Level)" ksor="Core" />
            <input type="text" value={opLevel} onChange={(e) => setOpLevel(e.target.value)} placeholder="예: L4-L5" className={inputCls} />
          </div>
          <div>
            <FieldLabel label="레벨 수 (Number of Levels)" ksor="Core" />
            <input type="number" value={numLevels} onChange={(e) => setNumLevels(e.target.value)} placeholder="예: 1" min="1" className={inputCls} />
          </div>
          <div>
            <FieldLabel label="수술 시간 (Op Time, min)" ksor="Core" />
            <input type="number" value={opTime} onChange={(e) => setOpTime(e.target.value)} placeholder="분 단위" className={inputCls} />
          </div>
          <div>
            <FieldLabel label="출혈량 (Blood Loss, mL)" ksor="Optional" note="Less relevant for endoscopic" />
            <input type="number" value={bloodLoss} onChange={(e) => setBloodLoss(e.target.value)} placeholder="mL 단위" className={inputCls} />
          </div>
          <div>
            <FieldLabel label="입원 기간 (Hospital Days)" ksor="Core" />
            <input type="number" value={hospitalDays} onChange={(e) => setHospitalDays(e.target.value)} placeholder="일 수" className={inputCls} />
          </div>
          <div>
            <FieldLabel label="집도의 경험 수준" sub="Surgeon Experience Level" ksor="Optional" note="Consider for learning curve analysis" />
            <select value={surgeonExp} onChange={(e) => setSurgeonExp(e.target.value)} className={`${inputCls} bg-white`}>
              <option value="">선택</option>
              <option value="fellow">전임의 (Fellow)</option>
              <option value="junior">초급 전문의 (&lt;5년)</option>
              <option value="senior">시니어 전문의 (≥5년)</option>
            </select>
          </div>
          <div>
            <FieldLabel label="항생제 예방 투여" sub="Antibiotic Prophylaxis" ksor="Optional" />
            <RadioGroup value={antibioticProphylaxis} onChange={setAntibioticProphylaxis} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-5 border-t border-gray-100">
          <div>
            <FieldLabel label="임플란트 사용 (Implant Used)" ksor="Core" note="Spine Tango has detailed implant catalogue" />
            <div className="space-y-2.5 mt-1">
              {(["cage", "screws", "none"] as const).map((key) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${implants[key] ? "border-blue-600 bg-blue-600" : "border-gray-300 hover:border-gray-400"}`}
                    onClick={() => toggleImplant(key)}
                  >
                    {implants[key] && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700" onClick={() => toggleImplant(key)}>
                    {key === "cage" ? "Cage" : key === "screws" ? "Screws" : "없음 (None)"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel
              label="개방술 전환 여부"
              sub="Conversion to Open"
              ksor="Core"
              badge="KSOR UNIQUE"
              note="KSOR UNIQUE: critical for endoscopic safety data"
            />
            <RadioGroup value={conversion} onChange={setConversion} />
          </div>
        </div>
      </div>

      {/* ── KSOR Endoscopic ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">KSOR Endoscopic</p>
        <h2 className="text-base text-gray-900 mb-5">내시경 세부 정보</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 접근법 */}
          <div>
            <FieldLabel
              label="내시경 접근법"
              sub="Endoscopic Approach"
              ksor="Core"
              badge="KSOR KEY"
              note="KSOR KEY VARIABLE: UBE / Full-endo / Biportal / Open"
            />
            <div className="flex flex-wrap gap-2 mt-1">
              {approachOptions.map((approach) => (
                <button
                  key={approach}
                  onClick={() => setSelectedApproach(approach)}
                  className={`px-4 py-1.5 rounded-full border text-sm transition-colors ${
                    selectedApproach === approach
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {approach}
                </button>
              ))}
            </div>
          </div>

          {/* 세부 술기 */}
          <div>
            <FieldLabel
              label="세부 술기"
              sub="Technique Detail"
              ksor="Core"
              badge="KSOR UNIQUE"
              note="KSOR UNIQUE: Interlaminar/Transforaminal, Uni/Bilateral"
            />
            <p className="text-xs text-gray-400 mt-1 mb-2">접근 방향</p>
            <div className="space-y-2 mb-4">
              {[
                { value: "interlaminar", label: "추궁간 (Interlaminar)" },
                { value: "transforaminal", label: "추간공 (Transforaminal)" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${selectedTechnique === opt.value ? "border-blue-600" : "border-gray-300 group-hover:border-gray-400"}`}
                    onClick={() => setSelectedTechnique(opt.value)}
                  >
                    {selectedTechnique === opt.value && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                  </div>
                  <span className="text-sm text-gray-700" onClick={() => setSelectedTechnique(opt.value)}>{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mb-2">편측/양측</p>
            <div className="space-y-2">
              {[
                { value: "unilateral", label: "편측 (Unilateral)" },
                { value: "bilateral", label: "양측 (Bilateral)" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${selectedLaterality === opt.value ? "border-blue-600" : "border-gray-300 group-hover:border-gray-400"}`}
                    onClick={() => setSelectedLaterality(opt.value)}
                  >
                    {selectedLaterality === opt.value && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                  </div>
                  <span className="text-sm text-gray-700" onClick={() => setSelectedLaterality(opt.value)}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 장비 */}
          <div>
            <FieldLabel
              label="사용 장비"
              sub="Endoscopy System / Brand"
              ksor="Core"
              badge="KSOR UNIQUE"
              note="KSOR UNIQUE: Equipment tracking"
            />
            <div className="relative mt-1">
              <button
                onClick={() => setDeviceOpen(!deviceOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className={selectedDevice ? "text-gray-900" : "text-gray-400"}>{selectedDevice || "장비 선택"}</span>
                {deviceOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {deviceOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                  {devices.map((device) => (
                    <button key={device} onClick={() => { setSelectedDevice(device); setDeviceOpen(false); }}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-blue-50 transition-colors ${selectedDevice === device ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}>
                      {device}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Optional endoscopic */}
          <div className="space-y-5">
            <div>
              <FieldLabel label="스코프 각도" sub="Scope Angle" ksor="Optional" note="Technical detail for learning curve research" />
              <div className="flex gap-2 mt-1">
                {scopeAngles.map((a) => (
                  <button
                    key={a}
                    onClick={() => setScopeAngle(a === scopeAngle ? "" : a)}
                    className={`px-4 py-1.5 rounded-full border text-sm transition-colors ${
                      scopeAngle === a
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel label="시각화 품질" sub="Visualization Quality" ksor="Optional" note="Surgeon-rated; consider for Phase 2" />
              <select value={vizQuality} onChange={(e) => setVizQuality(e.target.value)} className={`${inputCls} bg-white mt-1`}>
                <option value="">선택</option>
                <option value="excellent">우수 (Excellent)</option>
                <option value="good">양호 (Good)</option>
                <option value="fair">보통 (Fair)</option>
                <option value="poor">불량 (Poor)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Complications ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Complications</p>
        <h2 className="text-base text-gray-900 mb-5">합병증</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <FieldLabel label="수술 중 합병증" sub="Intraoperative Complication" ksor="Core" note="Dural tear, nerve injury, etc." />
            <RadioGroup value={intraoopComp} onChange={setIntraoopComp} />
            {intraoopComp === "yes" && (
              <div className="mt-3">
                <FieldLabel label="합병증 유형" sub="Complication Type" ksor="Core" note="Standardized classification needed" />
                <Dropdown
                  open={compTypeOpen}
                  setOpen={setCompTypeOpen}
                  value={compType}
                  setValue={setCompType}
                  options={compTypeOptions}
                  placeholder="유형 선택"
                />
              </div>
            )}
          </div>
          <div>
            <FieldLabel label="재수술 여부" sub="Reoperation" ksor="Core" />
            <RadioGroup value={reoperation} onChange={setReoperation} />
            {reoperation === "yes" && (
              <div className="mt-3">
                <FieldLabel label="재수술 이유" sub="Reoperation Reason" ksor="Core" note="Recurrence, infection, hematoma, etc." />
                <Dropdown
                  open={reoperationReasonOpen}
                  setOpen={setReoperationReasonOpen}
                  value={reoperationReason}
                  setValue={setReoperationReason}
                  options={reoperationReasonOptions}
                  placeholder="이유 선택"
                />
              </div>
            )}
          </div>
          <div>
            <FieldLabel label="30일 재입원" sub="30-day Readmission" ksor="Optional" note="ASR specific" />
            <RadioGroup value={readmission30} onChange={setReadmission30} />
          </div>
        </div>
      </div>

      {/* ── Follow-up ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Follow-up</p>
        <h2 className="text-base text-gray-900 mb-5">추적 관찰 시점</h2>
        <FieldLabel label="추적 관찰 시점 (Follow-up Timepoints)" ksor="Core" note="KSOR: more frequent early FU for endoscopic" />
        <div className="flex flex-wrap gap-2 mt-1">
          {["Pre-op", "1개월 (1m)", "3개월 (3m)", "6개월 (6m)", "1년 (1yr)"].map((tp) => (
            <button
              key={tp}
              onClick={() =>
                setFollowupTimepoints((prev) =>
                  prev.includes(tp) ? prev.filter((t) => t !== tp) : [...prev, tp]
                )
              }
              className={`px-4 py-1.5 rounded-full border text-sm transition-colors ${
                followupTimepoints.includes(tp)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
              }`}
            >
              {tp}
            </button>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button className="px-6 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          임시 저장
        </button>
        <button className="px-8 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition-colors">
          저장
        </button>
      </div>
    </div>
  );
}
