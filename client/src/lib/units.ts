import type { SwmmProject } from './swmm-types';

const SI_FLOW_UNITS = ['CMS', 'LPS', 'MLD'];

export function isSIProject(project: SwmmProject): boolean {
  return SI_FLOW_UNITS.includes((project.options?.['FLOW_UNITS'] || '').toUpperCase());
}

const US_TO_SI: Record<string, string> = {
  'ft': 'm',
  'ft²': 'm²',
  'ft³': 'm³',
  'ft/s': 'm/s',
  'in': 'mm',
  'in/hr': 'mm/hr',
  'in/day': 'mm/day',
  'ac': 'ha',
  'acres': 'ha',
  'CFS': 'CMS',
};

export function unitLabel(usUnit: string | undefined, project: SwmmProject): string | undefined {
  if (!usUnit) return usUnit;
  if (!isSIProject(project)) return usUnit;
  const flowUnits = (project.options?.['FLOW_UNITS'] || 'CMS').toUpperCase();
  if (usUnit === 'CFS') return flowUnits;
  return US_TO_SI[usUnit] || usUnit;
}
