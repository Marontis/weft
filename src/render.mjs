export function render(value) {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === null) {
    return 'nil';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return '(' + value.map(render).join(' ') + ')';
  }
  if (typeof value === 'object' && value !== null && value.kind) {
    return '<fn>';
  }
  return String(value);
}
