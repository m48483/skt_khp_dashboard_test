"""Convert the supplied workbook to browser data without dropping source rows."""
import argparse
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel


def parse_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, (int, float)):
        if value < 100000:
            return from_excel(value).date().isoformat()
        return datetime.strptime(str(int(value)), '%Y%m%d').date().isoformat()
    parts = re.findall(r'\d+', str(value))
    if len(parts) == 1:
        return datetime.strptime(parts[0], '%Y%m%d').date().isoformat()
    return datetime(*map(int, parts[:3])).date().isoformat()


def convert(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.active
    source = list(sheet.values)
    expected = ['판매일', '지역', '매장명', '상품군', '요금제', '수량', '매출액(원)', '담당자']
    if list(source[0]) != expected:
        raise ValueError('지원하지 않는 열 구조입니다.')
    rows, seen = [], set()
    for index, values in enumerate(source[1:], 2):
        if all(value is None for value in values):
            continue
        date, region, shop, category, plan, quantity, revenue, manager = values
        region = next((r for r in ['서울', '경기', '부산', '인천', '대구', '광주', '대전'] if str(region).startswith(r)), str(region))
        amount = int(re.sub(r'[,원\s]', '', revenue)) if isinstance(revenue, str) else int(revenue)
        row = dict(id=index, date=parse_date(date), region=region, store=shop, category=category,
                   plan=plan or None, quantity=int(quantity) if quantity is not None else None,
                   revenue=amount, manager=manager)
        key = tuple(value for key, value in row.items() if key != 'id')
        row['duplicate'] = key in seen
        seen.add(key)
        rows.append(row)
    workbook.close()
    return dict(source=Path(path).name, sheet=sheet.title, rows=rows,
                summary=dict(rows=len(rows), revenue=sum(r['revenue'] for r in rows),
                             quantity=sum(r['quantity'] or 0 for r in rows),
                             missingQuantity=sum(r['quantity'] is None for r in rows),
                             duplicateRows=sum(r['duplicate'] for r in rows),
                             start=min(r['date'] for r in rows), end=max(r['date'] for r in rows)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('workbook')
    parser.add_argument('--output', default='data/sales.js')
    args = parser.parse_args()
    data = convert(args.workbook)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text('window.SALES_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(json.dumps(data['summary'], ensure_ascii=False, indent=2))
