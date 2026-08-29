'use strict';

const ALLOWED_LABELS = new Set(['provider', 'operation', 'status', 'environment']);

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

class MetricsRegistry {
  constructor() {
    this.counters = new Map();
  }

  increment(name, labels = {}, amount = 1) {
    const safeLabels = Object.fromEntries(
      Object.entries(labels).filter(([key]) => ALLOWED_LABELS.has(key)).sort(([a], [b]) => a.localeCompare(b))
    );
    const key = `${name}|${JSON.stringify(safeLabels)}`;
    const current = this.counters.get(key) || { name, labels: safeLabels, value: 0 };
    current.value += amount;
    this.counters.set(key, current);
  }

  render() {
    const lines = [];
    for (const { name, labels, value } of this.counters.values()) {
      const pairs = Object.entries(labels).map(([key, val]) => `${key}="${escapeLabel(val)}"`);
      lines.push(`${name}${pairs.length ? `{${pairs.join(',')}}` : ''} ${value}`);
    }
    return `${lines.join('\n')}${lines.length ? '\n' : ''}`;
  }
}

module.exports = { MetricsRegistry, ALLOWED_LABELS };
