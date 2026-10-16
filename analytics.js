(function (root) {
  const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  function filter(rows, state) {
    return rows.filter(r => (!state.start || r.date >= state.start) && (!state.end || r.date <= state.end)
      && (!state.region || r.region === state.region) && (!state.store || r.store === state.store)
      && (!state.category || r.category === state.category) && (!state.excludeDuplicates || !r.duplicate));
  }
  function group(rows, key) {
    const groups = new Map();
    rows.forEach(r => {
      const name = typeof key === 'function' ? key(r) : r[key];
      if (!groups.has(name)) groups.set(name, {name, revenue: 0, quantity: 0, count: 0});
      const g = groups.get(name); g.revenue += r.revenue; g.quantity += r.quantity ?? 0; g.count++;
    });
    return [...groups.values()].sort((a,b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'ko'));
  }
  function summarize(rows) {
    return {revenue: sum(rows, 'revenue'), quantity: sum(rows, 'quantity'), count: rows.length,
      stores: new Set(rows.map(r => r.store)).size, missing: rows.filter(r => r.quantity === null).length};
  }
  function timeline(rows, start, end, grain) {
    if (!start || !end || start > end) return [];
    const groups = new Map(group(rows, r => grain === 'month' ? r.date.slice(0,7) : r.date).map(g => [g.name,g]));
    const dates = new Set();
    const cursor = new Date(start + 'T00:00:00Z');
    while (cursor.toISOString().slice(0,10) <= end) {
      const date = cursor.toISOString().slice(0,10); dates.add(grain === 'month' ? date.slice(0,7) : date);
      cursor.setUTCDate(cursor.getUTCDate()+1);
    }
    return [...dates].map(name => groups.get(name) || {name, revenue:0, quantity:0, count:0});
  }
  function search(rows, query) {
    const q = query.trim().toLocaleLowerCase();
    return rows.filter(r => [r.store,r.plan || '미기재',r.manager,r.region,r.category,r.date].join(' ').toLocaleLowerCase().includes(q));
  }
  function csv(rows) {
    const cell = value => '"' + String(value ?? '').replace(/^[=+\-@]/, "'$&").replaceAll('"','""') + '"';
    return '\uFEFF' + [['판매일','지역','매장명','상품군','요금제','수량','매출액(원)','담당자'], ...rows.map(r => [r.date,r.region,r.store,r.category,r.plan,r.quantity,r.revenue,r.manager])].map(row => row.map(cell).join(',')).join('\r\n');
  }
  const api = {sum, filter, group, summarize, timeline, search, csv};
  if (typeof module !== 'undefined') module.exports = api;
  else root.Analytics = api;
})(typeof window === 'undefined' ? globalThis : window);
