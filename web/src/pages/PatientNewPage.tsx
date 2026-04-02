import { useState, useEffect } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { surgeryService } from "../api/surgery";
import { patientService, type CaseDetail } from "../api/patients";
import { ApiValidationError, translateValidationMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";

const devices = ["Joimax", "RIWOspine", "Stryker", "Endovision"];

const approachOptions = ["Full-endo", "UBE", "Biportal", "Open"] as const;
type Approach = (typeof approachOptions)[number];

// code → display label maps (code is what gets sent to backend / stored in DB)
const procedureCodeMap: { code: string; label: string }[] = [
  { code: "P001", label: "내시경 디스크 절제술 (Full-endoscopic discectomy)" },
  { code: "P002", label: "UBE 감압술 (UBE decompression)" },
  { code: "P003", label: "현미경 디스크 절제술 (Microscopic discectomy)" },
  { code: "UBE", label: "양방향 내시경 (UBE)" },
  { code: "FULL_ENDO", label: "단일공 내시경 (Full-endoscopic)" },
  { code: "SPINOSCOPY", label: "Spinoscopy" },
];

const diagnosisCodeMap: { code: string; label: string }[] = [
  { code: "HNP", label: "추간판 탈출증 (HNP)" },
  { code: "STENOSIS", label: "척추관 협착증 (Stenosis)" },
  { code: "SPONDY", label: "척추전방전위증 (Spondylolisthesis)" },
  { code: "D001", label: "요추 추간판 탈출증 (Lumbar disc herniation)" },
  { code: "D002", label: "척추관 협착증 (Spinal stenosis)" },
  { code: "D003", label: "경추 추간판 탈출증 (Cervical disc herniation)" },
];

// Legacy string arrays kept for dropdowns that don't map to ref tables
const procedureTypes = procedureCodeMap.map((p) => p.label);
const primaryDiagnosisOptions = diagnosisCodeMap.map((d) => d.label);

const followupTimepointMap: { code: string; label: string }[] = [
  { code: "PRE_OP", label: "Pre-op" },
  { code: "POST_1M", label: "1개월 (1m)" },
  { code: "POST_3M", label: "3개월 (3m)" },
  { code: "POST_6M", label: "6개월 (6m)" },
  { code: "POST_1Y", label: "1년 (1yr)" },
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
    <div className="relative group min-h-[2.75rem] mb-1.5 flex flex-col justify-end">
      <span className="text-sm text-gray-700 dark:text-gray-300 cursor-default leading-relaxed">
        {label}
        {ksor === "Core" && (
          <span className="text-[10px] font-medium text-blue-500 border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 rounded px-1 py-0.5 leading-none ml-1.5 inline-block align-middle">Core</span>
        )}
        {ksor === "Optional" && (
          <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded px-1 py-0.5 leading-none ml-1.5 inline-block align-middle">Optional</span>
        )}
        {badge && (
          <span className="text-xs font-medium text-orange-500 ml-1.5">{badge}</span>
        )}
        {note && (
          <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors ml-1 inline-block align-middle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </span>
      {sub && <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</span>}

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
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
const inputClsDisabled =
  "w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed";
const sectionCls = "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm p-6 mb-5";

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
        <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
          <div
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${value === v ? "border-blue-600" : "border-gray-300 dark:border-gray-600"}`}
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
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={value ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}>{value || placeholder}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { setValue(opt); setOpen(false); }}
              className={`w-full text-left px-4 py-3 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${value === opt ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700" : "text-gray-700 dark:text-gray-300"}`}
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
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const passedPatient = (location.state as { patient?: Record<string, unknown> } | null)?.patient;
  const mode = searchParams.get('mode') ?? '';
  const isViewMode = mode === 'view';
  const isFollowupMode = mode === 'followup';
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
  const [selectedProcedure, setSelectedProcedure] = useState(() => {
    const code = passedPatient?.procedureCode as string | null;
    if (!code) return '';
    return procedureCodeMap.find(p => p.code === code)?.label ?? code;
  });
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);

  // Implant / conversion
  const [implants, setImplants] = useState({ cage: false, screws: false, none: false });
  const [conversion, setConversion] = useState<"yes" | "no" | "">("");

  // Demographics
  const [patientId, setPatientId] = useState(() => searchParams.get('patient') ?? '');
  const [surgeryDate, setSurgeryDate] = useState(() => (passedPatient?.surgeryDate as string) ?? '');
  const [surgeon, setSurgeon] = useState("");
  const [asaClass, setAsaClass] = useState("");

  // Diagnosis — pre-fill from passed patient data if available
  const [diagnosis, setDiagnosis] = useState(() => {
    const code = passedPatient?.diagnosisCode as string | null;
    if (!code) return '';
    return diagnosisCodeMap.find(d => d.code === code)?.label ?? code;
  });
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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Fetch existing case detail and pre-fill all form fields
  useEffect(() => {
    if (!patientId || !token) return;
    setLoading(true);
    patientService.getDetail(patientId, token).then((detail: CaseDetail) => {
      // Case record fields
      if (detail.surgery_date) setSurgeryDate(detail.surgery_date);
      if (detail.diagnosis_code) setDiagnosis(diagnosisCodeMap.find(d => d.code === detail.diagnosis_code)?.label ?? detail.diagnosis_code);
      if (detail.procedure_code) setSelectedProcedure(procedureCodeMap.find(p => p.code === detail.procedure_code)?.label ?? detail.procedure_code);

      // Extended form
      const ext = detail.extended_form;
      if (ext) {
        if (ext.approach_type) setSelectedApproach(ext.approach_type as Approach);
        if (ext.laterality) setSelectedLaterality(ext.laterality);
        if (ext.surgery_level) setOpLevel(ext.surgery_level);
        if (ext.operation_minutes) setOpTime(String(ext.operation_minutes));
        if (ext.estimated_blood_loss_ml) setBloodLoss(String(ext.estimated_blood_loss_ml));
        if (ext.hospital_stay_days) setHospitalDays(String(ext.hospital_stay_days));
        if (ext.implant_used_yn !== null) {
          if (ext.implant_used_yn) setImplants(prev => ({ ...prev, cage: true }));
          else setImplants({ cage: false, screws: false, none: true });
        }
      }

      // Initial form — comorbidities
      const ini = detail.initial_form;
      if (ini) {
        const comorbs = ini.comorbidities || [];
        if (comorbs.includes('DIABETES')) setDiabetes('yes');
        if (comorbs.includes('CARDIOVASCULAR')) setCardiovascular('yes');
        if (comorbs.includes('NEUROLOGICAL')) setNeurological('yes');
        if (comorbs.includes('DEPRESSION_ANXIETY')) setDepressionAnxiety('yes');
        if (comorbs.includes('PREV_SPINE_SURGERY')) setPrevSpineSurgery('yes');

        // Additional attributes (surgeon_name, asa_class, etc.)
        const aa = ini.additional_attributes;
        if (aa) {
          if (aa.surgeon_name) setSurgeon(aa.surgeon_name as string);
          if (aa.asa_class) setAsaClass(aa.asa_class as string);
          if (aa.diagnosis_level) setDiagnosisLevel(aa.diagnosis_level as string);
          if (aa.myelopathy_yn === true) setMyelopathy('yes');
          else if (aa.myelopathy_yn === false) setMyelopathy('no');
          if (aa.num_levels) setNumLevels(String(aa.num_levels));
          if (aa.surgeon_experience_years) setSurgeonExp(String(aa.surgeon_experience_years));
          if (aa.antibiotic_prophylaxis_yn === true) setAntibioticProphylaxis('yes');
          else if (aa.antibiotic_prophylaxis_yn === false) setAntibioticProphylaxis('no');
          if (aa.cci_score) setCci(String(aa.cci_score));
          if (aa.endo_technique) setSelectedTechnique(aa.endo_technique as string);
          if (aa.endo_device) setSelectedDevice(aa.endo_device as string);
          if (aa.scope_angle) setScopeAngle(aa.scope_angle as string);
          if (aa.viz_quality) setVizQuality(aa.viz_quality as string);
          if (aa.conversion_yn === true) setConversion('yes');
          else if (aa.conversion_yn === false) setConversion('no');
          if (Array.isArray(aa.followup_timepoints)) setFollowupTimepoints(aa.followup_timepoints as string[]);
        }
      }

      // Outcome form
      const out = detail.outcome_form;
      if (out) {
        if (out.complication_yn === true) setIntraoopComp('yes');
        else if (out.complication_yn === false) setIntraoopComp('no');
        if (out.complication_detail) setCompType(out.complication_detail);
        if (out.reoperation_yn === true) setReoperation('yes');
        else if (out.reoperation_yn === false) setReoperation('no');
        if (out.readmission_30d_yn === true) setReadmission30('yes');
        else if (out.readmission_30d_yn === false) setReadmission30('no');
        if (out.final_note) setReoperationReason(out.final_note);
      }
    }).catch(() => {
      // Case not found or no detail — keep defaults
    }).finally(() => setLoading(false));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const toggleImplant = (key: keyof typeof implants) => {
    if (key === "none") {
      setImplants({ cage: false, screws: false, none: !implants.none });
    } else {
      setImplants((prev) => ({ ...prev, none: false, [key]: !prev[key] }));
    }
  };

  const handleSubmit = async () => {
    if (!token) {
      setSubmitError('로그인이 필요합니다.');
      return;
    }

    // Field-level validation
    const newFieldErrors: Record<string, string> = {};
    if (!patientId) {
      newFieldErrors['patientId'] = '환자 번호를 입력해주세요.';
    }
    if (!surgeryDate) {
      newFieldErrors['surgeryDate'] = '수술일을 입력해주세요.';
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      // Scroll to and focus the first error field
      setTimeout(() => {
        const firstField = Object.keys(newFieldErrors)[0];
        const el = document.querySelector<HTMLInputElement>(`[data-field="${firstField}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      }, 0);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      // Build comorbidities list
      const comorbidities: string[] = [];
      if (diabetes === 'yes') comorbidities.push('DIABETES');
      if (cardiovascular === 'yes') comorbidities.push('CARDIOVASCULAR');
      if (neurological === 'yes') comorbidities.push('NEUROLOGICAL');
      if (depressionAnxiety === 'yes') comorbidities.push('DEPRESSION_ANXIETY');
      if (prevSpineSurgery === 'yes') comorbidities.push('PREV_SPINE_SURGERY');

      // Update clinical data for the case (patientId is used as caseId here)
      await surgeryService.updateClinical(patientId, {
        surgery_date: surgeryDate || undefined,
        diagnosis_code: diagnosisCodeMap.find((d) => d.label === diagnosis)?.code || diagnosis || undefined,
        surgery_level: opLevel || undefined,
        operation_minutes: Number(opTime) || undefined,
        estimated_blood_loss_ml: Number(bloodLoss) || undefined,
        hospital_stay_days: Number(hospitalDays) || undefined,
        approach_type: selectedApproach || undefined,
        laterality: selectedLaterality || undefined,
        implant_used_yn: implants.cage || implants.screws,
        comorbidities: comorbidities.length > 0 ? comorbidities : undefined,
        procedure_code: procedureCodeMap.find((p) => p.label === selectedProcedure)?.code || selectedProcedure || undefined,
        // Fields stored in additional_attributes
        surgeon_name: surgeon || undefined,
        asa_class: asaClass || undefined,
        diagnosis_level: diagnosisLevel || undefined,
        myelopathy_yn: myelopathy === 'yes' ? true : myelopathy === 'no' ? false : undefined,
        num_levels: Number(numLevels) || undefined,
        surgeon_experience_years: Number(surgeonExp) || undefined,
        antibiotic_prophylaxis_yn: antibioticProphylaxis === 'yes' ? true : antibioticProphylaxis === 'no' ? false : undefined,
        cci_score: Number(cci) || undefined,
        endo_technique: selectedTechnique || undefined,
        endo_device: selectedDevice || undefined,
        scope_angle: scopeAngle || undefined,
        viz_quality: vizQuality || undefined,
        conversion_yn: conversion === 'yes' ? true : conversion === 'no' ? false : undefined,
        followup_timepoints: followupTimepoints.length > 0 ? followupTimepoints : undefined,
      }, token);

      // Submit outcomes if any complications data exists
      if (intraoopComp !== '' || reoperation !== '' || readmission30 !== '') {
        await patientService.updateOutcomes(patientId, {
          complication_yn: intraoopComp === 'yes',
          complication_detail: compType || undefined,
          reoperation_yn: reoperation === 'yes',
          readmission_30d_yn: readmission30 === 'yes',
          final_note: reoperationReason || undefined,
        }, token);
      }

      setSubmitSuccess(true);
      navigate('/patients', { state: { saved: true } });
    } catch (err) {
      if (err instanceof ApiValidationError) {
        // backend field → data-field attribute
        const fieldMap: Record<string, string> = {
          case_id: 'patientId', surgery_date: 'surgeryDate', diagnosis_code: 'diagnosis',
          procedure_code: 'procedure', surgery_level: 'opLevel', operation_minutes: 'opTime',
          estimated_blood_loss_ml: 'bloodLoss', hospital_stay_days: 'hospitalDays',
          surgeon_name: 'surgeon', asa_class: 'asaClass', num_levels: 'numLevels',
          surgeon_experience_years: 'surgeonExp', cci_score: 'cci',
          approach_type: 'approach', laterality: 'laterality',
          comorbidities: 'comorbidities', followup_timepoints: 'followupTimepoints',
        };
        // backend field → Korean UI label
        const labelMap: Record<string, string> = {
          case_id: '환자 번호', surgery_date: '수술일', diagnosis_code: '진단명',
          procedure_code: '수술 방법', surgery_level: '수술 레벨', operation_minutes: '수술 시간',
          estimated_blood_loss_ml: '출혈량', hospital_stay_days: '입원 기간',
          surgeon_name: '집도의', asa_class: 'ASA 분류', num_levels: '레벨 수',
          surgeon_experience_years: '집도의 경험', cci_score: 'CCI 점수',
          approach_type: '접근법', laterality: '편측성',
          comorbidities: '동반 질환', followup_timepoints: '추적 관찰 시점',
        };
        const newErrors: Record<string, string> = {};
        const errorLabels: string[] = [];
        for (const fe of err.fields) {
          const mapped = fieldMap[fe.field] ?? fe.field;
          const label = labelMap[fe.field] ?? fe.field;
          newErrors[mapped] = `${label}: ${translateValidationMsg(fe.message)}`;
          errorLabels.push(label);
        }
        setFieldErrors(newErrors);
        setSubmitError(`다음 항목을 확인해주세요: ${errorLabels.join(', ')}`);
        // Scroll to first errored field
        setTimeout(() => {
          const firstField = Object.keys(newErrors)[0];
          const el = document.querySelector<HTMLElement>(`[data-field="${firstField}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.focus();
          }
        }, 0);
      } else {
        setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`p-4 md:p-8 min-h-screen bg-gray-50 dark:bg-gray-950 ${isViewMode ? 'pointer-events-none opacity-90' : ''}`} style={isViewMode ? { pointerEvents: 'auto' } : undefined}>
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl text-gray-900 dark:text-gray-100">
          {isViewMode ? 'KSOR 수술 정보 조회' : isFollowupMode ? 'KSOR F/U 입력' : 'KSOR 수술 정보 입력'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {isViewMode ? 'Korean Spine Outcomes Registry — View Only' : isFollowupMode ? 'Korean Spine Outcomes Registry — Follow-up Entry' : 'Korean Spine Outcomes Registry — Surgery Data Entry'}
        </p>
        {isViewMode && (
          <div className="mt-2 inline-block px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium">읽기 전용</div>
        )}
        {isFollowupMode && (
          <div className="mt-2 inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 rounded-full text-xs font-medium">팔로업 입력 모드</div>
        )}
      </div>

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm flex items-center justify-center py-20">
          <div className="h-12 w-12 rounded-full border-[3px] border-blue-200 border-t-blue-400 animate-spin" />
        </div>
      ) : (
      <fieldset disabled={isViewMode} style={{ border: 'none', padding: 0, margin: 0 }}>
      {/* ── Demographics ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Demographics</p>
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">환자 기본 정보</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          <div>
            <FieldLabel label={searchParams.get('patient') ? "환자 번호 (자동입력)" : "환자 번호"} />
            {searchParams.get('patient') ? (
              <input type="text" value={patientId} readOnly className={`${inputCls} bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed`} />
            ) : (
              <>
                <input type="text" data-field="patientId" value={patientId} onChange={(e) => { setPatientId(e.target.value); setFieldErrors((prev) => { const { patientId: _, ...rest } = prev; return rest; }); }} placeholder="예: 201933070" className={`${inputCls} ${fieldErrors['patientId'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
                {fieldErrors['patientId'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['patientId']}</p>}
              </>
            )}
          </div>
          <div>
            <FieldLabel label="수술일 (Surgery Date)" ksor="Core" />
            <input type="date" max="9999-12-31" data-field="surgeryDate" value={surgeryDate} onChange={(e) => { setSurgeryDate(e.target.value); setFieldErrors((prev) => { const { surgeryDate: _, ...rest } = prev; return rest; }); }} className={`${inputCls} ${fieldErrors['surgeryDate'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
            {fieldErrors['surgeryDate'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['surgeryDate']}</p>}
          </div>
          <div>
            <FieldLabel label="집도의 (Surgeon)" />
            <input type="text" data-field="surgeon" value={surgeon} onChange={(e) => setSurgeon(e.target.value)} placeholder="집도의 이름" className={`${inputCls} ${fieldErrors['surgeon'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
            {fieldErrors['surgeon'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['surgeon']}</p>}
          </div>
          <div>
            <FieldLabel
              label="ASA 분류 (ASA Class)"
              ksor="Core"
              note="Morbidity classification; SweSpine validation recommended improvement"
            />
            <select value={asaClass} onChange={(e) => setAsaClass(e.target.value)} className={`${inputCls} bg-white dark:bg-gray-700`}>
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
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">동반 질환</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 items-start">
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
            <input type="number" data-field="cci" value={cci} onChange={(e) => setCci(e.target.value)} min="0" placeholder="점수 입력" className={`${inputCls} ${fieldErrors['cci'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
            {fieldErrors['cci'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['cci']}</p>}
          </div>
        </div>
      </div>

      {/* ── Diagnosis ── */}
      <div className={sectionCls}>
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Diagnosis</p>
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">진단</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
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
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">수술 정보</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start mb-6">
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
            <input type="text" data-field="opLevel" value={opLevel} onChange={(e) => setOpLevel(e.target.value)} placeholder="예: L4-L5" className={`${inputCls} ${fieldErrors['opLevel'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
            {fieldErrors['opLevel'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['opLevel']}</p>}
          </div>
          <div>
            <FieldLabel label="레벨 수 (Number of Levels)" ksor="Core" />
            <input type="number" data-field="numLevels" value={numLevels} onChange={(e) => setNumLevels(e.target.value)} placeholder="예: 1" min="1" className={`${inputCls} ${fieldErrors['numLevels'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
            {fieldErrors['numLevels'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['numLevels']}</p>}
          </div>
          <div>
            <FieldLabel label="수술 시간 (Op Time, min)" ksor="Core" />
            <input type="number" data-field="opTime" value={opTime} onChange={(e) => setOpTime(e.target.value)} placeholder="분 단위" className={`${inputCls} ${fieldErrors['opTime'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
            {fieldErrors['opTime'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['opTime']}</p>}
          </div>
          <div>
            <FieldLabel label="출혈량 (Blood Loss, mL)" ksor="Optional" note="Less relevant for endoscopic" />
            <input type="number" data-field="bloodLoss" value={bloodLoss} onChange={(e) => setBloodLoss(e.target.value)} placeholder="mL 단위" className={`${inputCls} ${fieldErrors['bloodLoss'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
            {fieldErrors['bloodLoss'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['bloodLoss']}</p>}
          </div>
          <div>
            <FieldLabel label="입원 기간 (Hospital Days)" ksor="Core" />
            <input type="number" data-field="hospitalDays" value={hospitalDays} onChange={(e) => setHospitalDays(e.target.value)} placeholder="일 수" className={`${inputCls} ${fieldErrors['hospitalDays'] ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
            {fieldErrors['hospitalDays'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['hospitalDays']}</p>}
          </div>
          <div>
            <FieldLabel label="집도의 경험 수준" sub="Surgeon Experience Level" ksor="Optional" note="Consider for learning curve analysis" />
            <select value={surgeonExp} onChange={(e) => setSurgeonExp(e.target.value)} className={`${inputCls} bg-white dark:bg-gray-700`}>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-5 border-t border-gray-100 dark:border-gray-800 items-start">
          <div>
            <FieldLabel label="임플란트 사용 (Implant Used)" ksor="Core" note="Spine Tango has detailed implant catalogue" />
            <div className="space-y-2.5 mt-1">
              {(["cage", "screws", "none"] as const).map((key) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${implants[key] ? "border-blue-600 bg-blue-600" : "border-gray-300 dark:border-gray-600 hover:border-gray-400"}`}
                    onClick={() => toggleImplant(key)}
                  >
                    {implants[key] && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => toggleImplant(key)}>
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
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">내시경 세부 정보</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
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
                      : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400"
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
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-2">접근 방향</p>
            <div className="space-y-2 mb-4">
              {[
                { value: "interlaminar", label: "추궁간 (Interlaminar)" },
                { value: "transforaminal", label: "추간공 (Transforaminal)" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${selectedTechnique === opt.value ? "border-blue-600" : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400"}`}
                    onClick={() => setSelectedTechnique(opt.value)}
                  >
                    {selectedTechnique === opt.value && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => setSelectedTechnique(opt.value)}>{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">편측/양측</p>
            <div className="space-y-2">
              {[
                { value: "unilateral", label: "편측 (Unilateral)" },
                { value: "bilateral", label: "양측 (Bilateral)" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${selectedLaterality === opt.value ? "border-blue-600" : "border-gray-300 dark:border-gray-600 group-hover:border-gray-400"}`}
                    onClick={() => setSelectedLaterality(opt.value)}
                  >
                    {selectedLaterality === opt.value && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => setSelectedLaterality(opt.value)}>{opt.label}</span>
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
                className="w-full flex items-center justify-between px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className={selectedDevice ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}>{selectedDevice || "장비 선택"}</span>
                {deviceOpen ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
              </button>
              {deviceOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 overflow-hidden">
                  {devices.map((device) => (
                    <button key={device} onClick={() => { setSelectedDevice(device); setDeviceOpen(false); }}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${selectedDevice === device ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700" : "text-gray-700 dark:text-gray-300"}`}>
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
                        : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel label="시각화 품질" sub="Visualization Quality" ksor="Optional" note="Surgeon-rated; consider for Phase 2" />
              <select value={vizQuality} onChange={(e) => setVizQuality(e.target.value)} className={`${inputCls} bg-white dark:bg-gray-700 mt-1`}>
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
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">합병증</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
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
        <h2 className="text-base text-gray-900 dark:text-gray-100 mb-5">추적 관찰 시점</h2>
        <FieldLabel label="추적 관찰 시점 (Follow-up Timepoints)" ksor="Core" note="KSOR: more frequent early FU for endoscopic" />
        <div className="flex flex-wrap gap-2 mt-1">
          {followupTimepointMap.map(({ code, label }) => (
            <button
              key={code}
              onClick={() =>
                setFollowupTimepoints((prev) =>
                  prev.includes(code) ? prev.filter((t) => t !== code) : [...prev, code]
                )
              }
              className={`px-4 py-1.5 rounded-full border text-sm transition-colors ${
                followupTimepoints.includes(code)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      </fieldset>
      )}

      {submitError && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700">{submitError}</div>
      )}
      {submitSuccess && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg text-sm text-green-700">저장되었습니다.</div>
      )}

      {/* Save Button */}
      {!isViewMode && (
        <>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                const draftData = {
                  patientId, surgeryDate, surgeon, asaClass, diagnosis, diagnosisLevel,
                  myelopathy, selectedApproach, selectedTechnique, selectedLaterality,
                  selectedDevice, scopeAngle, vizQuality, selectedProcedure, opLevel,
                  numLevels, opTime, bloodLoss, hospitalDays, surgeonExp,
                  antibioticProphylaxis, implants, conversion, diabetes, cardiovascular,
                  neurological, depressionAnxiety, prevSpineSurgery, intraoopComp,
                  compType, reoperation, reoperationReason, readmission30, cci,
                  followupTimepoints,
                };
                localStorage.setItem('ksor_surgery_draft', JSON.stringify(draftData));
                setSubmitSuccess(true);
                setSubmitError(null);
                setTimeout(() => setSubmitSuccess(false), 3000);
              }}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              임시 저장
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-8 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm hover:bg-gray-800 dark:hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
