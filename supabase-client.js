(function (root) {
  'use strict';
  const PAGE_SIZE = 500;
  const MAX_ROWS = 100000;
  const COLUMNS = 'id,date,region,store,category,plan,quantity,revenue,manager';

  function normalizeRows(records) {
    const seen = new Set();
    const ids = new Set();
    return records.map(record => {
      if (!Number.isSafeInteger(record.id) || record.id < 1 || ids.has(record.id)) {
        throw new Error('판매 기록의 ID가 올바르지 않거나 중복됩니다.');
      }
      ids.add(record.id);
      if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)
          || !Number.isFinite(Date.parse(record.date))
          || new Date(record.date).toISOString().slice(0, 10) !== record.date) {
        throw new Error('판매일 형식이 올바르지 않습니다. DB의 날짜를 확인해 주세요.');
      }
      if (!Number.isSafeInteger(record.revenue) || record.revenue < 0
          || (record.quantity !== null && (!Number.isSafeInteger(record.quantity) || record.quantity < 0))) {
        throw new Error('매출액 또는 수량이 올바르지 않습니다. DB의 숫자 값을 확인해 주세요.');
      }
      for (const field of ['region', 'store', 'category', 'manager']) {
        if (typeof record[field] !== 'string' || !record[field].trim()) {
          throw new Error('필수 판매 정보가 비어 있습니다. DB의 지역·매장·상품군·담당자를 확인해 주세요.');
        }
      }
      if (record.plan !== null && typeof record.plan !== 'string') {
        throw new Error('요금제 형식이 올바르지 않습니다.');
      }
      const region = record.region.trim();
      const row = {
        id: record.id, date: record.date,
        region: ['서울', '경기', '부산', '인천', '대구', '광주', '대전'].find(name => region.startsWith(name)) || region,
        store: record.store.trim(), category: record.category.trim(), plan: record.plan?.trim() || null,
        quantity: record.quantity, revenue: record.revenue, manager: record.manager.trim()
      };
      const key = JSON.stringify([row.date, row.region, row.store, row.category, row.plan, row.quantity, row.revenue, row.manager]);
      row.duplicate = seen.has(key);
      seen.add(key);
      return row;
    });
  }

  function dataset(records) {
    const rows = normalizeRows(records);
    const dates = rows.map(row => row.date).sort();
    const revenue = rows.reduce((total, row) => total + row.revenue, 0);
    const quantity = rows.reduce((total, row) => total + (row.quantity ?? 0), 0);
    if (!Number.isSafeInteger(revenue) || !Number.isSafeInteger(quantity)) {
      throw new Error('집계가 브라우저에서 정확히 표현할 수 있는 범위를 초과했습니다.');
    }
    return {source: 'Supabase', rows, summary: {
      rows: rows.length, revenue, quantity,
      missingQuantity: rows.filter(row => row.quantity === null).length,
      duplicateRows: rows.filter(row => row.duplicate).length,
      start: dates[0] || '', end: dates.at(-1) || ''
    }};
  }

  async function fetchPage(url, key, fetchImpl, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Publishable keys belong in apikey, not in an Authorization JWT header.
      const response = await fetchImpl(url, {
        headers: {apikey: key, Accept: 'application/json', Prefer: 'count=exact'},
        cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error('판매 테이블이 아직 준비되지 않았습니다. Supabase에서 초기화 SQL을 실행해 주세요.');
        if (response.status === 401 || response.status === 403) throw new Error('판매 데이터를 조회할 권한이 없습니다. Supabase 키와 조회 정책을 확인해 주세요.');
        throw new Error(`판매 데이터를 불러오지 못했습니다 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`);
      }
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('판매 데이터 응답 형식이 올바르지 않습니다.');
      const range = response.headers.get('content-range') || '';
      const count = /\/(\d+)$/.exec(range);
      if (!count) throw new Error('전체 데이터 건수를 확인할 수 없습니다. Supabase 응답 설정을 확인해 주세요.');
      return {rows, count: Number(count[1])};
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('연결 시간이 초과되었습니다. 다시 불러오기를 눌러 주세요.');
      if (error instanceof TypeError) throw new Error('Supabase에 연결할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function load(config, {fetchImpl = root.fetch.bind(root), timeoutMs = 15000} = {}) {
    if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url)
        || !config.publishableKey?.startsWith('sb_publishable_') || !/^[a-z_][a-z0-9_]*$/.test(config.table)) {
      throw new Error('Supabase 연결 설정을 확인해 주세요.');
    }
    const all = [];
    let expected = null;
    let lastId = 0;
    while (expected === null || all.length < expected) {
      const url = new URL(`/rest/v1/${config.table}`, config.url);
      url.search = new URLSearchParams({select: COLUMNS, order: 'id.asc', limit: String(PAGE_SIZE), id: `gt.${lastId}`});
      const page = await fetchPage(url.toString(), config.publishableKey, fetchImpl, timeoutMs);
      if (expected === null) expected = page.count;
      if (expected > MAX_ROWS) throw new Error('판매 데이터가 100,000건을 초과했습니다. 서버 집계 구성이 필요합니다.');
      if (page.count !== expected - all.length) throw new Error('조회 중 판매 기록이 변경되었습니다. 다시 불러오기를 눌러 주세요.');
      if (!page.rows.length) {
        if (all.length !== expected) throw new Error('판매 기록을 끝까지 읽지 못했습니다. 다시 시도해 주세요.');
        break;
      }
      for (const row of page.rows) {
        if (!Number.isSafeInteger(row.id) || row.id <= lastId) throw new Error('판매 기록 순서가 올바르지 않습니다. 다시 시도해 주세요.');
        lastId = row.id;
        all.push(row);
      }
      if (all.length > expected) throw new Error('조회 중 판매 기록이 변경되었습니다. 다시 불러오기를 눌러 주세요.');
    }
    return dataset(all);
  }
  const api = {load, dataset};
  if (typeof module !== 'undefined') module.exports = api;
  else root.SupabaseSales = api;
})(typeof window === 'undefined' ? globalThis : window);
