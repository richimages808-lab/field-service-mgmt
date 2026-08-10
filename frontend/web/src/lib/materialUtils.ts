export function getCanonicalMaterialKey(name: string): string {
  if (!name) return '';
  let lower = name
    .toLowerCase()
    .replace(/\(optional\)/gi, '')
    .replace(/\(required\)/gi, '')
    .replace(/\(essential\)/gi, '')
    .trim();

  const synonymGroups: string[][] = [
    ['teflon', 'ptfe', 'thread seal', 'pipe sealant', 'sealant tape', 'plumber tape', 'plumbers tape', 'pipe tape'],
    ['plumber putty', 'plumbers putty', 'pipe putty', 'plumbing putty', 'putty'],
    ['wax ring', 'wax seal', 'toilet seal', 'closet seal', 'toilet wax'],
    ['supply line', 'supply tube', 'supply hose', 'braided supply', 'toilet supply', 'faucet supply'],
    ['closet bolt', 'toilet bolt', 'flange bolt', 'brass bolt'],
    ['caulk', 'silicone', 'sealant', 'bathroom caulk', 'kitchen caulk'],
    ['mixing valve', 'shower valve', 'shower cartridge', 'mixing valve cartridge', 'valve cartridge'],
    ['diverter spout', 'tub spout', 'bath spout', 'tub diverter']
  ];

  for (const group of synonymGroups) {
    if (group.some(alias => lower.includes(alias))) {
      return group[0].replace(/[^a-z0-9]/g, '');
    }
  }

  return lower.replace(/[^a-z0-9]/g, '');
}

export function findAllMaterialMatches(partName: string, materials: any[]): any[] {
  if (!materials || !materials.length || !partName) return [];
  const partKey = getCanonicalMaterialKey(partName);

  return materials.filter(m => {
    if (!m || !m.name) return false;
    const mKey = getCanonicalMaterialKey(m.name);
    if (mKey === partKey) return true;
    const pClean = partName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mClean = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return pClean.length > 3 && mClean.length > 3 && (pClean.includes(mClean) || mClean.includes(pClean));
  });
}
