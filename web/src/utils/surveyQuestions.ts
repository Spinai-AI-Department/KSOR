export type ChoiceOption = {
  value: number;
  title: string;
  desc: string;
};

export type VASQuestion = {
  type: 'vas';
  id: number;
  section: string;
  sliders: Array<{
    id: string;
    label: string;
  }>;
};

export type ChoiceQuestion = {
  type: 'choice';
  id: number;
  section: string;
  title: string;
  question: string;
  options: ChoiceOption[];
};

export type Question = VASQuestion | ChoiceQuestion;

export const surveyQuestions: Question[] = [
  {
    id: 1,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '두통 강도',
    question: '현재 두통(머리 통증)의 강도를 가장 잘 표현하는 것은 무엇입니까?',
    options: [
      { value: 0, title: '0 (두통 없음)', desc: '현재 두통이 전혀 없습니다.' },
      { value: 1, title: '1 (매우 약한 두통)', desc: '진통제 없이도 일상생활이 가능합니다.' },
      { value: 2, title: '2 (약한 두통)', desc: '진통제 복용 시 두통이 완전히 사라집니다.' },
      { value: 3, title: '3 (중간 두통)', desc: '진통제로 두통이 상당히 줄어듭니다.' },
      { value: 4, title: '4 (심한 두통)', desc: '진통제 효과가 미미하며 집중이 어렵습니다.' },
      { value: 5, title: '5 (매우 심한 두통)', desc: '진통제가 전혀 효과 없고 일상생활이 불가합니다.' },
    ],
  },
  {
    id: 2,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '감각 이상',
    question: '수술 이후 손, 발, 팔, 다리 등에\n저림·감각 이상 증상이 있습니까?',
    options: [
      { value: 0, title: '0 (전혀 없음)', desc: '감각 이상 증상이 전혀 없습니다.' },
      { value: 1, title: '1 (매우 경미)', desc: '가끔 느껴지나 일상생활에 지장 없습니다.' },
      { value: 2, title: '2 (경미)', desc: '자주 느껴지지만 활동에 큰 지장은 없습니다.' },
      { value: 3, title: '3 (중간)', desc: '지속적으로 느껴지며 세밀한 작업이 어렵습니다.' },
      { value: 4, title: '4 (심함)', desc: '감각이 많이 떨어져 일상동작에 제한이 있습니다.' },
      { value: 5, title: '5 (매우 심함)', desc: '감각을 거의 느끼지 못해 도움이 필요합니다.' },
    ],
  },
  {
    id: 3,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '운동 기능 (근력)',
    question: '수술 이후 팔 또는 다리의 근력 저하나\n마비 증상을 경험하고 있습니까?',
    options: [
      { value: 0, title: '0 (정상 근력)', desc: '근력 저하가 전혀 없습니다.' },
      { value: 1, title: '1 (매우 경미한 저하)', desc: '무거운 물건 들기가 약간 어렵습니다.' },
      { value: 2, title: '2 (경미한 저하)', desc: '근력이 약해졌으나 혼자 보행 가능합니다.' },
      { value: 3, title: '3 (중간 정도 저하)', desc: '계단 오르기 또는 장거리 보행이 어렵습니다.' },
      { value: 4, title: '4 (심한 저하)', desc: '보행 보조기구(지팡이·목발)가 필요합니다.' },
      { value: 5, title: '5 (마비/불가능)', desc: '스스로 움직이기 어렵고 타인의 도움이 필요합니다.' },
    ],
  },
  {
    id: 4,
    type: 'vas',
    section: '통증 시각 아날로그 척도 (VAS)',
    sliders: [
      { id: 'headache', label: '귀하의 현재 두통(머리 통증) 정도를 표시해 주세요.' },
      { id: 'neck', label: '귀하의 현재 경부(목) 통증 정도를 표시해 주세요.' },
    ],
  },
  {
    id: 5,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '균형감각 및 어지럼증',
    question: '수술 이후 어지럼증이나 균형을 잡기 어려운\n증상을 경험하고 있습니까?',
    options: [
      { value: 0, title: '0 (전혀 없음)', desc: '어지럼증이나 균형 이상이 없습니다.' },
      { value: 1, title: '1 (매우 경미)', desc: '빠르게 일어설 때만 잠깐 어지럽습니다.' },
      { value: 2, title: '2 (경미)', desc: '가끔 어지러워 잠시 멈춰야 합니다.' },
      { value: 3, title: '3 (중간)', desc: '자주 어지럽고 좁은 길 보행이 불안합니다.' },
      { value: 4, title: '4 (심함)', desc: '벽이나 지지대 없이는 걷기가 어렵습니다.' },
      { value: 5, title: '5 (매우 심함)', desc: '서 있는 것 자체가 어렵고 낙상 위험이 있습니다.' },
    ],
  },
  {
    id: 6,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '인지 기능 (기억력·집중력)',
    question: '수술 이후 기억력 저하, 집중력 감소,\n혼돈 등의 증상이 있습니까?',
    options: [
      { value: 0, title: '0 (전혀 없음)', desc: '인지 기능이 수술 전과 동일합니다.' },
      { value: 1, title: '1 (매우 경미)', desc: '가끔 깜빡하나 일상생활에 지장 없습니다.' },
      { value: 2, title: '2 (경미)', desc: '메모나 알림 도움이 자주 필요합니다.' },
      { value: 3, title: '3 (중간)', desc: '복잡한 업무나 대화 이해가 어렵습니다.' },
      { value: 4, title: '4 (심함)', desc: '간단한 지시도 이해하기 어렵습니다.' },
      { value: 5, title: '5 (매우 심함)', desc: '시간·장소·사람 인식이 어렵습니다.' },
    ],
  },
  {
    id: 7,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '시각 증상',
    question: '수술 이후 시야 흐림, 복시(두 개로 보임),\n시야 결손 등의 시각 이상이 있습니까?',
    options: [
      { value: 0, title: '0 (전혀 없음)', desc: '시각 이상 증상이 전혀 없습니다.' },
      { value: 1, title: '1 (매우 경미)', desc: '피로 시 잠깐 흐릿하게 보이는 수준입니다.' },
      { value: 2, title: '2 (경미)', desc: '때때로 복시가 있으나 금방 회복됩니다.' },
      { value: 3, title: '3 (중간)', desc: '자주 시야가 흐리고 독서·TV 시청이 힘듭니다.' },
      { value: 4, title: '4 (심함)', desc: '일부 시야가 가려 운전·계단 이용이 위험합니다.' },
      { value: 5, title: '5 (매우 심함)', desc: '심한 시야 결손으로 일상적 시각 활동이 불가합니다.' },
    ],
  },
  {
    id: 8,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '수면의 질',
    question: '수술 이후 두통, 신경통 또는 불안으로 인해\n수면에 어려움이 있습니까?',
    options: [
      { value: 0, title: '0 (전혀 없음)', desc: '숙면을 취하며 수면에 전혀 지장이 없습니다.' },
      { value: 1, title: '1 (약간 어려움)', desc: '수면제 없이도 대체로 잘 잡니다.' },
      { value: 2, title: '2 (중간 어려움)', desc: '수면 시간이 6시간 미만이거나 자주 깹니다.' },
      { value: 3, title: '3 (상당히 어려움)', desc: '수면 시간이 4시간 미만입니다.' },
      { value: 4, title: '4 (심한 어려움)', desc: '수면 시간이 2시간 미만이며 숙면이 불가합니다.' },
      { value: 5, title: '5 (전혀 불가능)', desc: '증상으로 인해 전혀 잠들 수 없습니다.' },
    ],
  },
  {
    id: 9,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '일상생활 수행 능력',
    question: '수술 이후 식사, 세면, 옷 입기 등\n기본적인 일상생활이 얼마나 가능합니까?',
    options: [
      { value: 0, title: '0 (완전히 독립)', desc: '도움 없이 모든 일상생활을 수행할 수 있습니다.' },
      { value: 1, title: '1 (거의 독립)', desc: '혼자 할 수 있으나 다소 시간이 걸립니다.' },
      { value: 2, title: '2 (부분 도움)', desc: '일부 활동에 가끔 도움이 필요합니다.' },
      { value: 3, title: '3 (상당한 도움)', desc: '대부분의 활동에 타인의 도움이 필요합니다.' },
      { value: 4, title: '4 (많은 도움)', desc: '거의 모든 활동에 지속적인 도움이 필요합니다.' },
      { value: 5, title: '5 (전적 의존)', desc: '모든 일상생활에 완전한 타인 도움이 필요합니다.' },
    ],
  },
  {
    id: 10,
    type: 'choice',
    section: '신경외과 기능 평가 (KPS)',
    title: '사회 및 직업 복귀',
    question: '수술 이후 직장 복귀, 사회활동, 취미생활이\n얼마나 가능한 상태입니까?',
    options: [
      { value: 0, title: '0 (완전히 복귀)', desc: '수술 전과 동일하게 직장·사회생활을 합니다.' },
      { value: 1, title: '1 (거의 복귀)', desc: '가벼운 활동에는 제한이 없습니다.' },
      { value: 2, title: '2 (부분 복귀)', desc: '시간제 또는 가벼운 업무만 가능합니다.' },
      { value: 3, title: '3 (상당히 제한)', desc: '집안 활동 위주로만 생활하고 있습니다.' },
      { value: 4, title: '4 (심하게 제한)', desc: '외출이 거의 불가능하며 대부분 실내에 있습니다.' },
      { value: 5, title: '5 (복귀 불가)', desc: '독립적인 사회·직업 활동이 전혀 불가능합니다.' },
    ],
  },
];
