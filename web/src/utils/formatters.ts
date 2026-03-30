export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

export function formatGenderAge(sex: 'M' | 'F', birthYear: number): string {
  const age = new Date().getFullYear() - birthYear
  return `${sex} / ${age}`
}
