export function safeJSONStringify(obj: any): string {
  return JSON.stringify(obj, (key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });
}

export function normalizeObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(normalizeObjectKeys);
  }
  
  const normalized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    normalized[key] = normalizeObjectKeys(value);
  }
  
  return normalized;
}

